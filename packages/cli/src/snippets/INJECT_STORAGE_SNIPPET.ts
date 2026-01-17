export const INJECT_STORAGE_SNIPPET = `
(function () {
  try {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this;
    if (!g) return;
    if (g.__RN_INSPECTOR_STORAGE_PATCHED__) return;
    g.__RN_INSPECTOR_STORAGE_PATCHED__ = true;

    function safeSerialize(obj, maxDepth) {
      maxDepth = maxDepth || 100;
      var seen = new WeakSet();
      function serialize(val, depth) {
        if (depth > maxDepth) return '[Max depth ' + depth + ']';
        if (val === null) return null;
        if (val === undefined) return undefined;
        var type = typeof val;
        if (type === 'string') return val;
        if (type === 'number' || type === 'boolean') return val;
        if (type === 'function') return '[Function: ' + (val.name || 'anonymous') + ']';
        if (type === 'symbol') return val.toString();
        if (type === 'bigint') return val.toString() + 'n';
        if (type !== 'object') return String(val);
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
        if (Array.isArray(val)) {
          var arr = [];
          for (var i = 0; i < val.length; i++) {
            arr.push(serialize(val[i], depth + 1));
          }
          return arr;
        }
        if (val instanceof Date) return val.toISOString();
        if (val instanceof RegExp) return val.toString();
        if (val instanceof Error) return { __type: 'Error', name: val.name, message: val.message, stack: val.stack };
        var result = {};
        var keys = Object.keys(val);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          try { result[key] = serialize(val[key], depth + 1); } catch (e) { result[key] = '[Error: ' + e.message + ']'; }
        }
        return result;
      }
      return serialize(obj, 0);
    }

    g.__RN_INSPECTOR_FETCH_STORAGE__ = function(requestId) {
      var result = { requestId: requestId, asyncStorage: null, redux: null, error: null };
      
      try {
        var AsyncStorage = null;
        if (g.__RN_INSPECTOR_ASYNC_STORAGE__) {
          AsyncStorage = g.__RN_INSPECTOR_ASYNC_STORAGE__;
        } else if (g.AsyncStorage) {
          AsyncStorage = g.AsyncStorage;
        } else {
          try {
            var rn = require('@react-native-async-storage/async-storage');
            AsyncStorage = rn.default || rn;
          } catch (e1) {
            try {
              var rn2 = require('react-native');
              AsyncStorage = rn2.AsyncStorage;
            } catch (e2) {}
          }
        }
        
        if (AsyncStorage && typeof AsyncStorage.getAllKeys === 'function') {
          AsyncStorage.getAllKeys().then(function(keys) {
            if (!keys || keys.length === 0) {
              result.asyncStorage = {};
              sendResult();
              return;
            }
            AsyncStorage.multiGet(keys).then(function(pairs) {
              var storage = {};
              (pairs || []).forEach(function(pair) {
                var key = pair[0];
                var value = pair[1];
                try {
                  storage[key] = JSON.parse(value);
                } catch (e) {
                  storage[key] = value;
                }
              });
              result.asyncStorage = safeSerialize(storage, 20);
              sendResult();
            }).catch(function(e) {
              result.asyncStorage = { error: e.message };
              sendResult();
            });
          }).catch(function(e) {
            result.asyncStorage = { error: e.message };
            sendResult();
          });
          return;
        } else {
          result.asyncStorage = { error: 'AsyncStorage not available' };
        }
      } catch (e) {
        result.asyncStorage = { error: e.message };
      }
      
      sendResult();
      
      function sendResult() {
        try {
          if (g.__REDUX_DEVTOOLS_EXTENSION__ && g.__REDUX_DEVTOOLS_EXTENSION__.store) {
            result.redux = safeSerialize(g.__REDUX_DEVTOOLS_EXTENSION__.store.getState(), 20);
          } else if (g.__RN_INSPECTOR_REDUX_STORE__) {
            result.redux = safeSerialize(g.__RN_INSPECTOR_REDUX_STORE__.getState(), 20);
          } else if (g.store && typeof g.store.getState === 'function') {
            result.redux = safeSerialize(g.store.getState(), 20);
          } else {
            result.redux = { error: 'Redux store not found' };
          }
        } catch (e) {
          result.redux = { error: e.message };
        }
        
        console.log('__RN_INSPECTOR_STORAGE__:' + JSON.stringify(result));
      }
    };
  } catch (eOuter) {}
})();`;