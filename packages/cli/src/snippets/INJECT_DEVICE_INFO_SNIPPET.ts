export const INJECT_DEVICE_INFO_SNIPPET = `
(function() {
  try {
    function collectDeviceInfo() {
      var deviceInfo = {};
      
      // Check for Hermes
      if (typeof HermesInternal !== 'undefined') {
        deviceInfo.engineType = 'Hermes';
        if (HermesInternal && typeof HermesInternal.getRuntimeProperties === 'function') {
          try {
            var hermesProps = HermesInternal.getRuntimeProperties();
            deviceInfo.hermesVersion = hermesProps['OSS Release Version'] || hermesProps.version || 'unknown';
          } catch (e) {}
        }
      } else if (typeof global !== 'undefined' && typeof global._v8runtime !== 'undefined') {
        deviceInfo.engineType = 'V8';
      } else if (typeof global !== 'undefined' && typeof global.JSC !== 'undefined') {
        deviceInfo.engineType = 'JavaScriptCore';
      } else {
        deviceInfo.engineType = 'Unknown';
      }
      
      // Check for JSI
      if (typeof global !== 'undefined') {
        deviceInfo.jsiEnabled = typeof global.nativeCallSyncHook !== 'undefined';
        deviceInfo.isFabricEnabled = typeof global.nativeFabricUIManager !== 'undefined';
        deviceInfo.isNewArchEnabled = deviceInfo.isFabricEnabled;
        deviceInfo.turboModulesEnabled = typeof global.__turboModuleProxy !== 'undefined';
        deviceInfo.bridgelessEnabled = typeof global.RN$Bridgeless !== 'undefined';
      }
      
      // Try to get device info from react-native modules
      try {
        var RN = require('react-native');
        
        // Get Platform info
        if (RN && RN.Platform) {
          deviceInfo.osName = RN.Platform.OS || 'unknown';
          deviceInfo.osVersion = String(RN.Platform.Version || 'unknown');
          
          if (RN.Platform.constants) {
            deviceInfo.systemVersion = RN.Platform.constants.Release || RN.Platform.constants.Version || deviceInfo.osVersion;
          }
        }
        
        // Get RN version from PlatformConstants
        if (RN && RN.PlatformConstants && RN.PlatformConstants.reactNativeVersion) {
          var rnVer = RN.PlatformConstants.reactNativeVersion;
          deviceInfo.reactNativeVersion = rnVer.major + '.' + rnVer.minor + '.' + rnVer.patch;
        }
        
        // Try react-native-device-info if available
        try {
          var DeviceInfo = require('react-native-device-info');
          var DI = DeviceInfo.default || DeviceInfo;
          
          // Sync methods
          if (typeof DI.getDeviceId === 'function') {
            try { deviceInfo.deviceId = DI.getDeviceId(); } catch(e) {}
          }
          if (typeof DI.getModel === 'function') {
            try { deviceInfo.deviceModel = DI.getModel(); } catch(e) {}
          }
          if (typeof DI.getBrand === 'function') {
            try { deviceInfo.deviceBrand = DI.getBrand(); } catch(e) {}
          }
          if (typeof DI.getSystemName === 'function') {
            try { deviceInfo.osName = DI.getSystemName(); } catch(e) {}
          }
          if (typeof DI.getSystemVersion === 'function') {
            try { deviceInfo.systemVersion = DI.getSystemVersion(); } catch(e) {}
          }
          if (typeof DI.getVersion === 'function') {
            try { deviceInfo.appVersion = DI.getVersion(); } catch(e) {}
          }
          if (typeof DI.getBuildNumber === 'function') {
            try { deviceInfo.appBuildNumber = DI.getBuildNumber(); } catch(e) {}
          }
          if (typeof DI.getBundleId === 'function') {
            try { deviceInfo.bundleId = DI.getBundleId(); } catch(e) {}
          }
          
          // Async methods
          if (typeof DI.getDeviceName === 'function') {
            DI.getDeviceName().then(function(name) {
              deviceInfo.deviceName = name;
              sendDeviceInfo(deviceInfo);
            }).catch(function() {});
          }
        } catch (e) {
          // react-native-device-info not available
        }
      } catch (e) {
        // React Native modules not available
      }
      
      return deviceInfo;
    }
    
    function sendDeviceInfo(info) {
      var data = info || collectDeviceInfo();
      data.ts = new Date().toISOString();
      if (typeof console !== 'undefined' && console.log) {
        console.log('__RN_INSPECTOR_DEVICE_INFO__:' + JSON.stringify(data));
      }
    }
    
    // Send initial device info
    sendDeviceInfo();
    
    // Send device info every 30 seconds to keep it updated
    setInterval(function() {
      sendDeviceInfo();
    }, 30000);
    
  } catch (err) {
    // Silently fail if device info collection fails
  }
})();
`;
