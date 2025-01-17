### 3.2.5-alpha.5 
- Add zone type to the activerooms checks 


### 3.2.5-alpha.3 
* Implemented cypher rotation to enable connections to Roombas using non-default cyphers


### 3.2.5-alpha.2 
* Updated Roomba library


### 3.2.5-alpha.1 
Fix script execution on Windows.


### 3.2.5-alpha.0 
- Add zone type checks


### 3.2.4 
- Conduct account checks only when needed.
- Introduced sanity checks to avoid complete app failure when configuration files are incomplete.


### 3.2.4-alpha.2 
- Add checks to the manual config that can cause a fatal crash


### 3.2.4-alpha.0 
- Update email and password check to not run when doing manual config


### 3.2.3 
- Added a fallback mechanism to the iRobot login system to first check authentication URL 1, and if it fails, fall back to URL 2


### 3.2.2
- Catch error when logging in to iRobot to prevent full crash


### 3.2.1 
- Remove preinstall script (unnecessary global install)


### 3.2.0 
* Bugfixes
* Code cleanup
* Prepare for Homebridge v2
* Update user_pmapv_id when a change has been detected (usually when a map update suggestion was accepted, or a re-mapping has happened)
* Preserve region parameters if present to prevent unusable room switches
* When smart map is updated, update region information so that the switches in Homekit keep working



### 3.2.0-alpha.8 
- Cleanup of the code


### 3.2.0-alpha.7 
* No changes


### 3.2.0-alpha.5 
* Update user_pmapv_id when a change has been detected (usually when a map update suggestion was accepted, or a re-mapping has happened)


### 3.2.0-alpha.4 
* Minor bugfix + less logging


### 3.2.0-alpha.3 
* Preserve region parameters if present to prevent unusable room switches


### 3.2.0-alpha.2 
* Update dependencies to fix ID error


### 3.2.0-alpha.1 
* When smart map is updated, update region information (fix attempt 1) so that the switches in Homekit keep working


### 3.1.0 
Release 3.1.0


### 3.1.0-alpha.13 
* Check for presence of bin on Roomba update messages as models such as M6 don't have a bin.


### 3.1.0-alpha.8 
* Improve logging


### 3.1.0-alpha.7 
* Added extra logging for status updates from Roombo
* Code cleanup


### 3.1.0-alpha.6 
* Rework info logging


### 3.1.0-alpha.5 
* Remove unnecessary INFO logging when HomeKit asks for the latest status of the accessory.


### 3.1.0-alpha.4 
* Battery percentage information wrong on M6 investigation


### 3.1.0-alpha.3 
* Experiment: Rework MQTT to prevent spams in the logs (when offline no longer force disconnect and reconnect)


### 3.1.0-alpha.2 
* Add multiroom support for m6


### 3.1.0-alpha.1 
- No longer add m6 as a bad roomba by default


### 3.0.1 
* Update package information for Homebridge verification


### 3.0.0 
* Release of 3.0.0


### 3.0.0-alpha.14 
* Refactor getRoombaCredentials to no longer require a third-party deprecated library


### 3.0.0-alpha.13 
* Add security checks to prevent multiple start events from triggering the Roombo, causing it to not start at all (saving smart map)


### 3.0.0-alpha.10 
* Rework the front UI to redirect to the correct GitHub repo


### 3.0.0-alpha.9 
* Prevent duplicate change of mode on main Accessory (fan)


### 3.0.0-alpha.7 
* Re-introduce scripts


### 3.0.0-alpha.6 
* Automatically update fan mode based on room selection.


### 3.0.0-alpha.05
* Refactoring of the code
* Updating libraries

### 3.0.0-alpha.04
* Attempt 1 to fix room by room starting by adding missing "room" context

### 3.0.0-alpha.03
* Added extra logging for room-by-room debugging

### 3.0.0-alpha.02
* Refactoring of the code
* Updating documentation

### 3.0.0-alpha.01
* Refactoring of the code for own usage
* Added extra logging

### 2.1.17
* Correctly rename everything to V2

### 2.1.16
* Accepted pull request for i3 room support

### 2.1.15 
* Set program to resume robot if job is already active
* Set program to stop Roomba if room-by-room request received
* Added j7 support (hopefully 🤞)


### 2.1.14 
* Added the ability to manually configure Roomba's instead of using your iRobot credentials


### 2.1.14 Beta 4 
* Improved logging when using manual configuration
* Fixed logic when determining if device supports room-by-room cleaning


### 2.1.14 Beta 3 
* Fixed homebridge crash due to logic error when configuring Roomba's


### 2.1.14 Beta 2 
* Fixed homebridge crash when reading variable ver


### 2.1.14 Beta 1 
* Added support for manually configuring Roomba's instead of entering your Roomba credentials


### 2.1.13 
* Fixed how getRoombas.ts handles unconfigured Roombas to address issues #23 and #34 


### 2.1.12 
* Added software version to custom ui


### 2.1.11 
* Fixed Stuck Sensor, Thanks @Ghost108
* Changed on/off logs from debug to info


### 2.1.10 
* Fixed crash when starting second IP sweep
* Removed devices if it fails to find IP


### 2.1.9 
* Fixed homebridge crash on offline


### 2.1.8 
* Fixed typo during Roomba IP discovery. Thanks @rcoletti116 


### 2.1.7 
* Set Accessory to not responding in HomeKit when Roomba disconnects
* Added Log for when Roomba is stuck
* Made IP search run again after 5 seconds for up to 5 attempts
* Prevented plugin from adding m6's


### 2.1.6 
* Removed Log Spam When Reconnecting After Connection Drop
* Made Low Battery Warnings Not Appear If Roomba Is Charging


### 2.1.5 
* Removed Broken Status From Device Table In Custom UI


### 2.1.4
* Removed Status From Table Since It Always Says Online

### 2.1.3
* Changed Logic For Identifying If Region Is Already Saved
* Added 5 Second Delay Before Reconnecting If The Connection Drops

### 2.1.2
* Added Support Page In Custom UI
* (Wiki Links Don't Work Yet)

### 2.1.1
* Re-arranged table
* fixed rooms section in table

### 2.1.0
* Added custom UI

### 2.1.0-beta.3
* Removed Mac Address from devices table

### 2.1.0-beta.2
* hid spinner while looking for devices in custom UI

### 2.1.0-beta.1
* Fixed menuHome custom UI error

### 2.1.0-beta.0
* Started To Work On Custom UI

### 2.0.5
* Set log added in version [2.0.2](#202) to debug 
* Set on/off logs to info
* Added log for when roomba is stuck

### 2.0.4
* fixed typo in room sync functions when adding new room to existing map

### 2.0.3
* Fixed error where it wouldn't add new regions

### 2.0.2
* Added Log When Updating Homekit Rooms

### 2.0.1
* Made disableMultiRoom default to false in config

### 2.0.0
* Became A Homebridge Vertified Plugin
* Set Password format to password in Schema

### 1.3.2
* Made Roomba execute off action 2 after 5 seconds if state dosent change

### 1.3.1
* Prevented plugin from initilizing if it dosent have an email/password

### 1.3.0
* Added support for Multiple Rooms
* Made Roomba wait 1 second for scenes when it is turned on

### 1.2.0
* Added Room-By-Room Abilities On Models That Support It

### 1.1.0
* Added More Configuation options
