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

    function getAsyncStorage() {
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
      return AsyncStorage;
    }

    function getReduxStore() {
      if (g.__REDUX_DEVTOOLS_EXTENSION__ && g.__REDUX_DEVTOOLS_EXTENSION__.store) {
        return g.__REDUX_DEVTOOLS_EXTENSION__.store;
      }
      if (g.__RN_INSPECTOR_REDUX_STORE__) return g.__RN_INSPECTOR_REDUX_STORE__;
      if (g.store && typeof g.store.getState === 'function') return g.store;
      return null;
    }

    function fetchAsyncStorage(callback) {
      var AsyncStorage = getAsyncStorage();
      if (!AsyncStorage || typeof AsyncStorage.getAllKeys !== 'function') {
        callback({ error: 'AsyncStorage not available' });
        return;
      }
      AsyncStorage.getAllKeys()
        .then(function(keys) {
          if (!keys || keys.length === 0) {
            callback({});
            return;
          }
          AsyncStorage.multiGet(keys)
            .then(function(pairs) {
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
              callback(safeSerialize(storage, 20));
            })
            .catch(function(e) {
              callback({ error: e.message });
            });
        })
        .catch(function(e) {
          callback({ error: e.message });
        });
    }

    function fetchReduxState() {
      try {
        var store = getReduxStore();
        if (!store) return { error: 'Redux store not found' };
        return safeSerialize(store.getState(), 20);
      } catch (e) {
        return { error: e.message };
      }
    }

    function sendStorageResult(result) {
      console.log('__RN_INSPECTOR_STORAGE__:' + JSON.stringify(result));
    }

    function parsePath(path) {
      if (!path) return [];
      if (Array.isArray(path)) return path;
      var normalized = String(path)
        .replace(/\[(\d+)\]/g, '.$1')
        .replace(/^\./, '');
      return normalized.split('.').filter(function(part) { return part.length; });
    }

    function setAtPath(obj, pathParts, value) {
      if (!pathParts.length) return value;
      var current = obj;
      for (var i = 0; i < pathParts.length - 1; i++) {
        var key = pathParts[i];
        if (current[key] === null || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      current[pathParts[pathParts.length - 1]] = value;
      return obj;
    }

    function deleteAtPath(obj, pathParts) {
      if (!obj || !pathParts.length) return false;
      var current = obj;
      for (var i = 0; i < pathParts.length - 1; i++) {
        var key = pathParts[i];
        if (!current || typeof current !== 'object') return false;
        current = current[key];
      }
      var last = pathParts[pathParts.length - 1];
      if (current && Object.prototype.hasOwnProperty.call(current, last)) {
        delete current[last];
        return true;
      }
      return false;
    }

    g.__RN_INSPECTOR_FETCH_STORAGE__ = function(requestId) {
      var result = { requestId: requestId, asyncStorage: null, redux: null, error: null };

      fetchAsyncStorage(function(asyncResult) {
        result.asyncStorage = asyncResult;
        result.redux = fetchReduxState();
        result.ts = new Date().toISOString();
        sendStorageResult(result);
      });
    };

    g.__RN_INSPECTOR_MUTATE_STORAGE__ = function(payload) {
      if (!payload || !payload.requestId) return;
      var requestId = payload.requestId;
      var result = { requestId: requestId, asyncStorage: null, redux: null, error: null };
      var target = payload.target;
      var op = payload.op;
      var path = payload.path;
      var value = payload.value;

      var pathParts = parsePath(path);

      if (target === 'asyncStorage') {
        fetchAsyncStorage(function(asyncResult) {
          if (!asyncResult || asyncResult.error) {
            result.asyncStorage = asyncResult || { error: 'AsyncStorage not available' };
            result.redux = fetchReduxState();
            result.ts = new Date().toISOString();
            sendStorageResult(result);
            return;
          }

          var rootKey = pathParts.shift();
          if (!rootKey) {
            result.asyncStorage = { error: 'Invalid path' };
            result.redux = fetchReduxState();
            result.ts = new Date().toISOString();
            sendStorageResult(result);
            return;
          }

          var rootValue = asyncResult[rootKey];
          if (op === 'set') {
            if (pathParts.length === 0) {
              rootValue = value;
            } else {
              if (rootValue === null || typeof rootValue !== 'object') {
                rootValue = {};
              }
              setAtPath(rootValue, pathParts, value);
            }
          } else if (op === 'delete') {
            if (pathParts.length === 0) {
              rootValue = undefined;
            } else if (rootValue && typeof rootValue === 'object') {
              deleteAtPath(rootValue, pathParts);
            }
          }

          var AsyncStorage = getAsyncStorage();
          if (!AsyncStorage || typeof AsyncStorage.setItem !== 'function') {
            result.asyncStorage = { error: 'AsyncStorage not available' };
            result.redux = fetchReduxState();
            result.ts = new Date().toISOString();
            sendStorageResult(result);
            return;
          }

          var persistPromise;
          if (op === 'delete' && pathParts.length === 0) {
            persistPromise = AsyncStorage.removeItem(String(rootKey));
          } else {
            var serializedValue;
            try {
              serializedValue = JSON.stringify(rootValue);
            } catch (e) {
              serializedValue = String(rootValue);
            }
            persistPromise = AsyncStorage.setItem(String(rootKey), serializedValue);
          }

          Promise.resolve(persistPromise)
            .then(function() {
              fetchAsyncStorage(function(nextAsync) {
                result.asyncStorage = nextAsync;
                result.redux = fetchReduxState();
                result.ts = new Date().toISOString();
                sendStorageResult(result);
              });
            })
            .catch(function(e) {
              result.asyncStorage = { error: e.message };
              result.redux = fetchReduxState();
              result.ts = new Date().toISOString();
              sendStorageResult(result);
            });
        });
        return;
      }

      if (target === 'redux') {
        var store = getReduxStore();
        if (!store) {
          result.redux = { error: 'Redux store not found' };
          result.asyncStorage = { error: 'AsyncStorage not available' };
          result.ts = new Date().toISOString();
          sendStorageResult(result);
          return;
        }

        var currentState = store.getState();
        var nextState;

        if (op === 'set') {
          nextState = setAtPath(JSON.parse(JSON.stringify(currentState)), pathParts, value);
        } else if (op === 'delete') {
          nextState = JSON.parse(JSON.stringify(currentState));
          deleteAtPath(nextState, pathParts);
        } else {
          nextState = currentState;
        }

        if (typeof store.dispatch === 'function') {
          store.dispatch({ type: '__RN_INSPECTOR_REDUX_SET_STATE__', payload: nextState });
        }

        result.redux = safeSerialize(nextState, 20);
        fetchAsyncStorage(function(nextAsync) {
          result.asyncStorage = nextAsync;
          result.ts = new Date().toISOString();
          sendStorageResult(result);
        });
        return;
      }

      result.error = 'Unknown storage target';
      result.redux = fetchReduxState();
      fetchAsyncStorage(function(nextAsync) {
        result.asyncStorage = nextAsync;
        result.ts = new Date().toISOString();
        sendStorageResult(result);
      });
    };
  } catch (eOuter) {}
})();
`;
