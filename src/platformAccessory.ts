import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { iRobotPlatform } from './platform';
import events from 'events';
const eventEmitter = new events.EventEmitter();

import { Robot } from './getRoombas';
import dorita980 from '@karlvr/dorita980';

const ROBOT_CIPHERS = ['AES128-SHA256', 'TLS_AES_256_GCM_SHA384'];


/**
 * Check if we should try a different cipher
 *
 * @param error - The error to check
 *
 * @returns - If we should try a different cipher
 */
function shouldTryDifferentCipher(error: Error) {
    if (error.message.indexOf('TLS') !== -1) {
        return true;
    }

    if (error.message.toLowerCase().indexOf('identifier rejected') !== -1) {
        return true;
    }

    return false;
}

/**
 * Platform Accessory
 *
 * An instance of this class is created for each Roomba.
 */
export class iRobotPlatformAccessory {
    private service: Service;
    private battery: Service;
    private stuck!: Service;
    private binFilter!: Service;
    private binContact!: Service;
    private binMotion!: Service;
    private shutdown = false;
    private starting = false;
    private cipherIndex = 0;

    private binConfig: string[] = this.device.multiRoom && this.platform.config.ignoreMultiRoomBin ?
        [] : this.platform.config.bin.split(':');

    private roomba!: dorita980.Local;
    private active = false;
    private lastStatus = { cycle: '', phase: '' };
    private lastCommandStatus = { pmap_id: null };
    private state = 0;
    private binFull = 0;
    private batteryStatus = { 'low': false, 'percent': 50, 'charging': true };
    private stuckStatus = false;
    private roomByRoom = false;

    constructor(
        private readonly platform: iRobotPlatform,
        private readonly accessory: PlatformAccessory,
        private readonly device: Robot,
    ) {
        this.platform.api.on('shutdown', () => {
            this.platform.log.info('Disconnecting From Roomba:', device.name);
            this.shutdown = true;

            if (this.accessory.context.connected) {
                // Free MQTT connection
                this.roomba.end();
            }
        });

        this.configureRoomba();

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'iRobot')
            .setCharacteristic(this.platform.Characteristic.Model, this.device.model || this.device.info.sku || 'N/A')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.info.serialNum || this.accessory.UUID || 'N/A')
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.device.info.sw || this.device.info.ver || 'N/A')
            .getCharacteristic(this.platform.Characteristic.Identify).on('set', this.identify.bind(this));

        this.service = this.accessory.getService(this.device.name) ||
        this.accessory.addService(this.platform.Service.Fanv2, this.device.name, 'Main-Service');
        this.service.setPrimaryService(true);

        if (this.device.multiRoom && this.accessory.context.maps !== undefined) {
            this.updateRooms();
        }

        if (this.binConfig.includes('filter')) {
            this.binFilter = this.accessory.getService(this.device.name + '\'s Bin Filter') ||
            this.accessory.addService(this.platform.Service.FilterMaintenance, this.device.name + '\'s Bin Filter', 'Filter-Bin');
        }

        if (this.binConfig.includes('contact')) {
            this.binContact = this.accessory.getService(this.device.name + '\'s Bin Contact Sensor') ||
            this.accessory.addService(this.platform.Service.ContactSensor, this.device.name + '\'s Bin Contact Sensor', 'Contact-Bin');
        }

        if (this.binConfig.includes('motion')) {
            this.binMotion = this.accessory.getService(this.device.name + '\'s Bin Motion Sensor') ||
            this.accessory.addService(this.platform.Service.MotionSensor, this.device.name + '\'s Bin Motion Sensor', 'Motion-Bin');
        }

        this.battery = this.accessory.getService(this.device.name + '\'s Battery') ||
        this.accessory.addService(this.platform.Service.Battery, this.device.name + '\'s Battery', 'Battery-Service');

        if (!this.platform.config.hideStuckSensor) {
            this.stuck = this.accessory.getService(this.device.name + ' Stuck') ||
            this.accessory.addService(this.platform.Service.MotionSensor, this.device.name + ' Stuck', 'Stuck-MotionSensor');
        }

        this.service.getCharacteristic(this.platform.Characteristic.Active)
            .onSet(this.set.bind(this))
            .onGet(this.get.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.CurrentFanState)
            .onGet(this.getState.bind(this));

        if (this.device.multiRoom) {
            this.service.getCharacteristic(this.platform.Characteristic.TargetFanState)
                .onGet(this.getMode.bind(this))
                .onSet(this.setMode.bind(this));
        }

        if (this.binConfig.includes('filter')) {
            this.binFilter.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
                .onGet(this.getBinfull.bind(this));
        }
        if (this.binConfig.includes('contact')) {
            this.binContact.getCharacteristic(this.platform.Characteristic.ContactSensorState)
                .onGet(this.getBinfull.bind(this));
        }
        if (this.binConfig.includes('motion')) {
            this.binMotion.getCharacteristic(this.platform.Characteristic.MotionDetected)
                .onGet(this.getBinfullBoolean.bind(this));
        }

        this.battery.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
            .onGet(this.getBatteryStatus.bind(this));
        this.battery.getCharacteristic(this.platform.Characteristic.BatteryLevel)
            .onGet(this.getBatteryLevel.bind(this));
        this.battery.getCharacteristic(this.platform.Characteristic.ChargingState)
            .onGet(this.getChargeState.bind(this));

        if (!this.platform.config.hideStuckSensor) {
            this.stuck.getCharacteristic(this.platform.Characteristic.MotionDetected)
                .onGet(this.getStuck.bind(this));
        }

        this.platform.log.info('Configured Roomba Accessory:', this.device.name);
    }

    async configureRoomba() {
        const reconnectTimestamps: number[] = [];


        this.accessory.context.connected = false;

        if (this.device.info.sku?.startsWith('j')) {
            process.env.ROBOT_CIPHERS = 'TLS_AES_256_GCM_SHA384';
        }

        try {
            this.roomba = new dorita980.Local(
                this.device.blid,
                this.device.password,
                this.device.ip,
                this.device.info.ver !== undefined ? parseInt(this.device.info.ver) as 2 | 3 : 2,
                {
                    ciphers: ROBOT_CIPHERS[this.cipherIndex],
                },
            );

            this.roomba.on('connect', () => {
                this.accessory.context.connected = true;
                this.platform.log.info('Successfully connected to roomba', this.device.name);
            }).on('offline', () => {
                this.accessory.context.connected = false;
                this.platform.log.warn('Roomba', this.device.name, ' went offline...');
            }).on('reconnect', () => {
                this.accessory.context.connected = true;
                this.platform.log.info('Successfully reconnected to roomba', this.device.name);

                reconnectTimestamps.push(Date.now());

                // If we have more than 5 timestamps, remove the oldest one
                if (reconnectTimestamps.length > 5) {
                    reconnectTimestamps.shift();

                    // If the difference between the oldest and the newest timestamp is less than or equal to 30 seconds
                    if (reconnectTimestamps[reconnectTimestamps.length - 1] - reconnectTimestamps[0] <= 30000) {
                        this.platform.log.error(
                            'Roomba',
                            this.device.name,
                            ' has been reconnecting too many times in the last 30 seconds, stopping...',
                            '\n',
                            'This is probably related due to the limited (1) connection slots on the Roomba, try closing any other application',
                            'on services that might be connected to the Roomba.',
                            '\n',
                            'If this error persists, try restarting the Homebridge service or the Roomba, it is possible the IP address',
                            'of the Roomba has changed.',
                        );

                        this.roomba.end();

                        this.platform.log.error('Roomba', this.device.name, ' has been stopped, trying to reconnect in 5 minutes...');

                        // Let us try again in five minutes
                        setTimeout(() => {
                            this.configureRoomba();
                        }, 300000);
                    }
                }
            }).on('close', () => {
                this.accessory.context.connected = false;

                if (this.shutdown) {
                    this.platform.log.info('Roomba', this.device.name, 'connection closed');

                    this.roomba.removeAllListeners();
                } else {
                    this.platform.log.warn('Roomba', this.device.name, ' connection closed.');
                }
            }).on(
                'state',
                this.updateRoombaState.bind(this),
            ).on('error', (error) => {
                this.platform.log.error('Roomba', this.device.name, ' error:', error);

                if (shouldTryDifferentCipher(error) && this.cipherIndex < ROBOT_CIPHERS.length - 1) {
                    this.cipherIndex = this.cipherIndex + 1;

                    this.platform.log.warn('Trying different cipher:', ROBOT_CIPHERS[this.cipherIndex]);

                    this.roomba.end();

                    this.configureRoomba();
                }
            });
        } catch (err) {
            this.platform.log.error('Fatal error connecting to Roomba:', this.device.name);
        }
    }

    updateRoombaState(data) {
        if (data.cleanMissionStatus.cycle !== this.lastStatus.cycle || data.cleanMissionStatus.phase !== this.lastStatus.phase) {
            eventEmitter.emit('state');

            this.platform.log.debug(this.device.name + '\'s mission update:',
                '\n cleanMissionStatus:', JSON.stringify(data.cleanMissionStatus, null, 2),
                '\n batPct:', data.batPct,
                '\n bin:', JSON.stringify(data.bin),
                '\n lastCommand:', JSON.stringify(data.lastCommand));
            if (data.cleanMissionStatus.phase === 'stuck' && this.lastStatus.phase !== 'stuck') {
                this.platform.log.warn('Roomba', this.device.name, 'Is Stuck!');
            } else if (this.lastStatus.phase === 'stuck' && data.cleanMissionStatus.phase !== 'stuck') {
                this.platform.log.info('Roomba', this.device.name, 'Says "Thank You For Freeing Me"');
            }
        }

        if (
            (this.device.multiRoom &&
                (data.lastCommand.pmap_id !== null && data.lastCommand.pmap_id !== undefined)
            )
            && data.lastCommand.pmap_id !== this.lastCommandStatus.pmap_id
        ) {
            this.updateMap(data.lastCommand);
        }


        this.updatePlatformAccessoryInternalState(data);
        this.updatePlatformAccessoryCharacteristics();
    }

    private updatePlatformAccessoryCharacteristics() {
        this.service.updateCharacteristic(this.platform.Characteristic.Active, this.active ? 1 : 0);
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentFanState, this.state);

        if (this.binConfig.includes('filter')) {
            this.binFilter.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, this.binFull);
        }
        if (this.binConfig.includes('contact')) {
            this.binContact.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.binFull);
        }
        if (this.binConfig.includes('motion')) {
            this.binMotion.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.binFull === 1);
        }

        if (this.platform.config.hideStuckSensor) {
            this.stuck.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.stuckStatus);
        }

        this.battery.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.batteryStatus.percent);
        this.battery.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.batteryStatus.low);
        this.battery.updateCharacteristic(this.platform.Characteristic.ChargingState, this.batteryStatus.charging);
    }

    private updatePlatformAccessoryInternalState(data) {
        this.lastStatus = data.cleanMissionStatus;
        this.lastCommandStatus = data.lastCommand;
        this.active = this.getHomekitActive(data.cleanMissionStatus);
        this.state = this.active ? 2 : this.getEveInactive(data.cleanMissionStatus) ? 0 : 1;

        // Some models like the M6 don't have a bin sensor
        if (data.bin) {
            this.binFull = data.bin.full ? 1 : 0;
        }

        this.stuckStatus = data.cleanMissionStatus.phase === 'stuck';
        this.batteryStatus.charging = data.cleanMissionStatus.phase === 'charge';
        this.batteryStatus.low = this.batteryStatus.charging && data.batPct < (this.platform.config.lowBattery || 20);
        this.batteryStatus.percent = data.batPct;
    }

    updateMap(lastCommand: {
        pmap_id: never, regions: [{
            parameters: object,
            region_id?: string,
            type?: string,
        }],
        user_pmapv_id: never,
    }) {
        if (this.accessory.context.maps !== undefined) {
            let currentMap: {
                regions: [{ region_id?: string, parameters: object, type?: string }],
                user_pmapv_id: string,
            } | null = null;

            for (const map of this.accessory.context.maps) {
                if (map.pmap_id === lastCommand.pmap_id) {
                    currentMap = map;
                }
            }

            if (currentMap) {
                //update the user_pmapv_id if necessary
                this.platform.log.debug('Comparing user_pmapv_id:', lastCommand.user_pmapv_id, 'with', currentMap.user_pmapv_id);
                if (lastCommand.user_pmapv_id !== currentMap.user_pmapv_id) {
                    this.platform.log.info('Updating user_pmapv_id for roomba since the map was updated since last time:', this.device.name, '(', lastCommand.user_pmapv_id, ')');

                    currentMap.user_pmapv_id = lastCommand.user_pmapv_id;
                }

                for (const region of lastCommand.regions) {
                    let exists = false;

                    for (const region_ of currentMap.regions) {
                        if ((region_.region_id === region.region_id) && (region_.type === region.type)) {
                            const regionIndex = currentMap.regions.indexOf(region_);

                            this.platform.log.info('Updating existing region for roomba.', this.device.name, '(', region.region_id, ', ', region.type, ')');

                            // If the current region has parameters, but the new one doesn't, keep the old parameters
                            if (region_.parameters && !region.parameters) {
                                region.parameters = region_.parameters;

                                this.platform.log.debug('Keeping old parameters for region', region.region_id);
                            }

                            currentMap.regions[regionIndex] = region;

                            exists = true;
                        }
                    }

                    if (!exists) {
                        this.platform.log.info('Adding new region for roomba:', this.device.name, '\n', region);
                        currentMap.regions.push(region);
                    }
                }

                this.platform.log.debug(this.device.name + '\'s map update:',
                    '\n map:', JSON.stringify(this.accessory.context.maps));
                this.platform.log.info('Updating Homekit Rooms for Roomba:', this.device.name);
                this.updateRooms();
            } else {
                this.platform.log.info('Creating new map for roomba:', this.device.name);

                this.accessory.context.maps.push({
                    'pmap_id': lastCommand.pmap_id,
                    'regions': lastCommand.regions,
                    'user_pmapv_id': lastCommand.user_pmapv_id,
                });

                this.platform.log.debug(this.device.name + '\'s map update:',
                    '\n map:', JSON.stringify(this.accessory.context.maps));
                this.platform.log.debug('Updating Homekit Rooms for Roomba:', this.device.name);
                this.updateRooms();
            }
        } else {
            this.platform.log.info('Creating new map for roomba:', this.device.name);
            this.accessory.context.maps = [{
                'pmap_id': lastCommand.pmap_id,
                'regions': lastCommand.regions,
                'user_pmapv_id': lastCommand.user_pmapv_id,
            }];

            this.platform.log.debug(this.device.name + '\'s map create:',
                '\n map:', JSON.stringify(this.accessory.context.maps));

            this.platform.log.info('Updating Homekit Rooms for Roomba:', this.device.name);
            this.updateRooms();
        }
    }

    updateRooms() {
        this.accessory.context.activeRooms = [];

        for (const map of this.accessory.context.maps) {
            const index = this.accessory.context.maps.indexOf(map);

            for (const region of map.regions) {
                ((this.accessory.getService('Map ' + index + ' Room ' + region.region_id + ' ' + region.type) ||
          this.accessory.addService(this.platform.Service.Switch,
              'Map ' + index + ' Room ' + region.region_id + ' ' + region.type,
              index + ':' + region.region_id + ':' + region.type))
                    .getCharacteristic(this.platform.Characteristic.On))
                    .removeAllListeners()
                    .onSet((activate) => {
                        if (activate) {
                            this.accessory.context.activeMap = index;

                            if (!this.accessory.context.activeRooms.includes(region.region_id + ':' + region.type)) {
                                this.accessory.context.activeRooms.push(region.region_id + ':' + region.type);
                            }

                            this.service.setCharacteristic(this.platform.Characteristic.TargetFanState, 0);
                        } else {
                            this.accessory.context.activeRooms.splice(this.accessory.context.activeRooms.indexOf(region.region_id + ':' + region.type));

                            if (this.accessory.context.activeRooms.length === 0) {
                                this.service.setCharacteristic(this.platform.Characteristic.TargetFanState, 1);
                            }
                        }

                        this.platform.log.info(activate ? 'enabling' : 'disabling',
                            'room ' +
                            region.region_id + ' (' + region.type + ')' +
                            ' of map ' +
                            index +
                            ' on roomba ' +
                            this.device.name +
                            '(' + this.accessory.context.maps[this.accessory.context.activeMap].pmap_id + ')');
                    })
                    .onGet(() => {
                        return this.accessory.context.activeMap === index ?
                            this.accessory.context.activeRooms.includes(region.region_id + ':' + region.type) : false;
                    });
            }
        }
    }

    getHomekitActive(cleanMissionStatus: { [x: string]: string | boolean }): boolean {
        const configStatus: string[] | boolean[] = this.platform.config.status.split(':');

        switch (configStatus[0]) {
            case true:
                return true;
            case false:
                return false;
            case 'inverted':
                return cleanMissionStatus[configStatus[1] as string] !== configStatus[2];
            default:
                return cleanMissionStatus[configStatus[0] as string] === configStatus[1];
        }
    }

    getEveInactive(cleanMissionStatus: { [x: string]: string | boolean }): boolean {
        const configStatus: string[] | boolean[] = this.platform.config.eveStatus.split(':');
        switch (configStatus[0]) {
            case true:
                return true;
            case false:
                return false;
            case 'inverted':
                return cleanMissionStatus[configStatus[1] as string] !== configStatus[2];
            default:
                return cleanMissionStatus[configStatus[0] as string] === configStatus[1];
        }
    }

    /**
     * Handle the "GET" requests from HomeKit
     * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
     *
     * Note: These get requests are verry performance sensitive. Make sure to optimize them as much as possible.
     */
    async get(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Active State:', this.active ? 'On' : 'Off');

        if (this.accessory.context.connected) {
            return this.active ? 1 : 0;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getState(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Fan State:', this.state);

        if (this.accessory.context.connected) {
            return this.state;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getBinfull(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Bin Full:', this.binFull);

        if (this.accessory.context.connected) {
            return this.binFull;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getBinfullBoolean(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Bin Full:', this.binFull === 1);

        if (this.accessory.context.connected) {
            return this.binFull === 1;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getBatteryLevel(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Battery Level:', this.batteryStatus.percent);

        if (this.accessory.context.connected) {
            return this.batteryStatus.percent;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getBatteryStatus(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Battery Status:', this.batteryStatus.low ? 'Low' : 'Normal');

        if (this.accessory.context.connected) {
            return this.batteryStatus.low ? 1 : 0;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getChargeState(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Charging State:', this.batteryStatus.charging ? 'Charging' : 'Not Charging');

        if (this.accessory.context.connected) {
            return this.batteryStatus.charging ? 1 : 0;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getMode(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Mode:', this.roomByRoom ? 'Room-By-Room' : 'Everywhere');

        if (this.accessory.context.connected) {
            return this.roomByRoom ? 0 : 1;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getStuck(): Promise<CharacteristicValue> {
        this.platform.log.debug('Homekit Requested', this.device.name, '\'s Stuck State:', this.stuckStatus ? 'Stuck' : 'Not Stuck');

        if (this.accessory.context.connected) {
            return this.stuckStatus;
        } else {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async identify() {
        if (this.accessory.context.connected) {
            await this.roomba.find();

            this.platform.log.info('Identifying', this.device.name, '(Note: Some Models Won\'t Beep If Docked');
        }
    }

    /**
     * Handle "SET" requests from HomeKit
     */
    async set(value: CharacteristicValue) {
        if (this.accessory.context.connected) {
            const configOffAction: string[] = this.platform.config.offAction.split(':');
            let args;

            try {
                if (value === 1) {
                    if (this.starting) {
                        this.platform.log.info('Roomba is already starting a cycle, skipping');

                        return;
                    }

                    this.starting = true;

                    //give scenes a chance to run
                    setTimeout(async () => {
                        this.platform.log.info('Starting Clean Cycle');
                        this.platform.log.info('Room By Room:', this.roomByRoom);

                        if (this.roomByRoom) {
                            this.platform.log.debug('Active Rooms:', JSON.stringify(this.accessory.context));

                            if (this.accessory.context.activeRooms !== undefined) {
                                args = {
                                    'ordered': 1,
                                    'pmap_id': this.accessory.context.maps[this.accessory.context.activeMap].pmap_id,
                                    'user_pmapv_id': this.accessory.context.maps[this.accessory.context.activeMap].user_pmapv_id,
                                    'regions': [{}],
                                };

                                args.regions.splice(0);

                                for (const room of this.accessory.context.activeRooms) {
                                    for (const region of this.accessory.context.maps[this.accessory.context.activeMap].regions) {
                                        const region_id = room.split(':')[0];
                                        const type = room.split(':')[1];

                                        if (region.region_id === region_id && region.type === type) {
                                            args.regions.push(region);
                                        }
                                    }
                                }
                                this.platform.log.debug('Clean Room Args:\n', JSON.stringify(args));
                                this.roomba.cleanRoom(args);
                            }
                        } else {
                            await this.roomba.clean();
                            await this.roomba.resume();
                        }

                        this.starting = false;
                    }, this.device.multiRoom ? 1000 : 0);
                } else {
                    await this.roomba[configOffAction[0]]();

                    this.platform.log.info('Stopping Clean Cycle');

                    setTimeout(async () => {
                        this.platform.log.info('Executing second action:', configOffAction[1]);

                        await this.roomba[configOffAction[1]]();
                    }, 5000);

                    this.starting = false;
                }
                this.platform.log.debug('Set', this.device.name, 'To',
                    value === 0 ? configOffAction[0] + (configOffAction[1] !== 'none' ? ' and ' + configOffAction[1] : '') : 'Clean',
                    this.roomByRoom ? 'With args:' + JSON.stringify(args) : '');

            } catch (err) {
                this.platform.log.warn('Error Seting', this.device.name, 'To',
                    value === 0 ? configOffAction[0] + (configOffAction[1] !== 'none' ? ' and ' + configOffAction[1] : '') : 'Clean',
                    this.roomByRoom ? 'With args:' + JSON.stringify(args) : '');
                this.platform.log.error(err as string);
                this.starting = false;
            }
        }
    }

    async setMode(value: CharacteristicValue) {
        if (this.accessory.context.connected) {
            this.platform.log.info('Set', this.device.name, 'To', value === 0 ? 'Room-By-Room' : 'Everywhere');
            this.roomByRoom = value === 0;
        }
    }
}
