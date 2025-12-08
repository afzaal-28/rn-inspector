export const INJECT_NETWORK_SNIPPET = `
(function () {
  try {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this;
    if (!g) return;
    if (g.__RN_INSPECTOR_NETWORK_PATCHED__) return;
    g.__RN_INSPECTOR_NETWORK_PATCHED__ = true;

    var pendingRequests = {};
    var xhrIdMap = new WeakMap();

    function logNetwork(payload) {
      try {
        if (typeof console !== 'undefined' && console.log) {
          console.log('__RN_INSPECTOR_NETWORK__:' + JSON.stringify(payload));
        }
      } catch (e) {}
    }

    function toPlainHeaders(headers) {
      var out = {};
      if (!headers) return out;
      try {
        if (typeof headers.forEach === 'function') {
          headers.forEach(function (v, k) { out[k] = String(v); });
        } else if (Array.isArray(headers)) {
          headers.forEach(function (entry) {
            if (Array.isArray(entry) && entry.length >= 2) out[entry[0]] = String(entry[1]);
            else if (entry && typeof entry === 'object' && entry.name) out[entry.name] = String(entry.value || '');
          });
        } else if (typeof headers === 'object') {
          Object.keys(headers).forEach(function (k) { out[k] = String(headers[k]); });
        }
      } catch (e) {}
      return out;
    }

    function truncateBody(text, limit) {
      limit = limit || 500000;
      if (!text) return text;
      if (typeof text !== 'string') {
        try { text = JSON.stringify(text); } catch (e) { text = String(text); }
      }
      return text.length > limit ? text.slice(0, limit) + '... [truncated]' : text;
    }

    function genId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    // ============ FETCH SHIM ============
    var originalFetch = g.fetch;
    if (typeof originalFetch === 'function') {
      g.fetch = function (input, init) {
        var id = genId();
        var start = Date.now();
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method) || (input && input.method) || 'GET';
        var requestHeaders = toPlainHeaders((init && init.headers) || (input && input.headers));
        var requestBody = init && typeof init.body !== 'undefined' ? init.body : undefined;

        logNetwork({
          id: id, phase: 'start', ts: new Date().toISOString(),
          method: method, url: url, durationMs: 0,
          requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
          source: 'fetch'
        });

        return originalFetch(input, init)
          .then(function (res) {
            var responseHeaders = toPlainHeaders(res && res.headers);
            var clone;
            try { clone = res && res.clone ? res.clone() : null; } catch (e) { clone = null; }

            if (!clone || typeof clone.text !== 'function') {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: method, url: url, status: res && res.status,
                durationMs: Date.now() - start,
                requestHeaders: requestHeaders, responseHeaders: responseHeaders,
                requestBody: truncateBody(requestBody), source: 'fetch'
              });
              return res;
            }

            return clone.text().then(function (text) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: method, url: url, status: res && res.status,
                durationMs: Date.now() - start,
                requestHeaders: requestHeaders, responseHeaders: responseHeaders,
                requestBody: truncateBody(requestBody), responseBody: truncateBody(text),
                source: 'fetch'
              });
              return res;
            }).catch(function () {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: method, url: url, status: res && res.status,
                durationMs: Date.now() - start,
                requestHeaders: requestHeaders, responseHeaders: responseHeaders,
                requestBody: truncateBody(requestBody), source: 'fetch'
              });
              return res;
            });
          })
          .catch(function (error) {
            logNetwork({
              id: id, phase: 'error', ts: new Date().toISOString(),
              method: method, url: url, durationMs: Date.now() - start,
              requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
              error: String(error && error.message ? error.message : error),
              source: 'fetch'
            });
            throw error;
          });
      };
    }

    // ============ XHR SHIM ============
    var OriginalXHR = g.XMLHttpRequest;
    if (OriginalXHR && typeof OriginalXHR === 'function') {
      g.XMLHttpRequest = function () {
        var xhr = new OriginalXHR();
        var id = genId();
        var method = 'GET';
        var url = '';
        var start = 0;
        var requestHeaders = {};
        var requestBody;
        var logged = false;

        var origOpen = xhr.open;
        xhr.open = function (m, u) {
          method = m || 'GET';
          url = u || '';
          return origOpen.apply(xhr, arguments);
        };

        var origSetRequestHeader = xhr.setRequestHeader;
        xhr.setRequestHeader = function (k, v) {
          try { requestHeaders[k] = v; } catch (e) {}
          return origSetRequestHeader.apply(xhr, arguments);
        };

        var origSend = xhr.send;
        xhr.send = function (body) {
          requestBody = body;
          start = Date.now();
          logNetwork({
            id: id, phase: 'start', ts: new Date().toISOString(),
            method: method, url: url, durationMs: 0,
            requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
            source: 'xhr'
          });
          return origSend.apply(xhr, arguments);
        };

        function logEnd() {
          if (logged) return;
          logged = true;
          var responseHeaders = {};
          try {
            var raw = xhr.getAllResponseHeaders();
            if (raw) {
              raw.trim().split(/\\r?\\n/).forEach(function (line) {
                var idx = line.indexOf(':');
                if (idx > 0) {
                  responseHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
                }
              });
            }
          } catch (e) {}

          logNetwork({
            id: id, phase: xhr.status === 0 ? 'error' : 'end',
            ts: new Date().toISOString(),
            method: method, url: url, status: xhr.status || undefined,
            durationMs: Date.now() - (start || Date.now()),
            requestHeaders: requestHeaders, responseHeaders: responseHeaders,
            requestBody: truncateBody(requestBody),
            responseBody: truncateBody(xhr.responseText),
            error: xhr.status === 0 ? 'XHR failed' : undefined,
            source: 'xhr'
          });
        }

        xhr.addEventListener('loadend', logEnd);
        xhr.addEventListener('error', function (e) {
          if (logged) return;
          logged = true;
          logNetwork({
            id: id, phase: 'error', ts: new Date().toISOString(),
            method: method, url: url, durationMs: Date.now() - (start || Date.now()),
            requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
            error: e && e.message ? e.message : 'XHR error',
            source: 'xhr'
          });
        });

        return xhr;
      };
      g.XMLHttpRequest.UNSENT = 0;
      g.XMLHttpRequest.OPENED = 1;
      g.XMLHttpRequest.HEADERS_RECEIVED = 2;
      g.XMLHttpRequest.LOADING = 3;
      g.XMLHttpRequest.DONE = 4;
    }

    // ============ REACT NATIVE NETWORKING MODULE (Low-level native HTTP) ============
    try {
      var RN = require('react-native');
      var NativeModules = RN && RN.NativeModules;
      
      // Patch NativeModules.Networking
      if (NativeModules && NativeModules.Networking) {
        var Networking = NativeModules.Networking;
        
        if (typeof Networking.sendRequest === 'function' && !Networking.__patched) {
          Networking.__patched = true;
          var origSendRequest = Networking.sendRequest.bind(Networking);
          Networking.sendRequest = function (method, trackingName, url, headers, data, responseType, incrementalUpdates, timeout, callback, withCredentials) {
            var id = genId();
            var start = Date.now();
            var reqHeaders = toPlainHeaders(headers);

            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: method || 'GET', url: url || '', durationMs: 0,
              requestHeaders: reqHeaders, requestBody: truncateBody(data),
              source: 'rn-native'
            });

            pendingRequests[id] = { method: method, url: url, start: start, headers: reqHeaders, data: data };

            var wrappedCallback = function (requestId, response) {
              var duration = Date.now() - start;
              var status = response && response.status;
              var respHeaders = toPlainHeaders(response && response.headers);

              logNetwork({
                id: id, phase: status ? 'end' : 'error', ts: new Date().toISOString(),
                method: method || 'GET', url: url || '', status: status,
                durationMs: duration,
                requestHeaders: reqHeaders, responseHeaders: respHeaders,
                requestBody: truncateBody(data),
                responseBody: truncateBody(response && (response.body || response.data)),
                error: !status ? 'Native request failed' : undefined,
                source: 'rn-native'
              });

              delete pendingRequests[id];
              if (callback) callback(requestId, response);
            };

            return origSendRequest(method, trackingName, url, headers, data, responseType, incrementalUpdates, timeout, wrappedCallback, withCredentials);
          };
        }

        // Also patch addListener for response events
        if (typeof Networking.addListener === 'function' && !Networking.__listenerPatched) {
          Networking.__listenerPatched = true;
          var origAddListener = Networking.addListener.bind(Networking);
          Networking.addListener = function (eventType, handler) {
            if (eventType === 'didReceiveNetworkResponse' || eventType === 'didCompleteNetworkResponse') {
              var wrappedHandler = function () {
                try {
                  var args = Array.prototype.slice.call(arguments);
                  if (args[0] && typeof args[0] === 'object') {
                    var evt = args[0];
                    logNetwork({
                      id: 'evt-' + genId(), phase: eventType === 'didCompleteNetworkResponse' ? 'end' : 'response',
                      ts: new Date().toISOString(),
                      method: 'GET', url: evt.url || '', status: evt.status,
                      responseHeaders: toPlainHeaders(evt.headers),
                      responseBody: truncateBody(evt.body || evt.data),
                      source: 'rn-event'
                    });
                  }
                } catch (e) {}
                return handler.apply(this, arguments);
              };
              return origAddListener(eventType, wrappedHandler);
            }
            return origAddListener(eventType, handler);
          };
        }
      }

      // Patch ImageLoader for image requests
      if (NativeModules && NativeModules.ImageLoader) {
        var ImageLoader = NativeModules.ImageLoader;
        
        if (typeof ImageLoader.getSize === 'function' && !ImageLoader.__getSizePatched) {
          ImageLoader.__getSizePatched = true;
          var origGetSize = ImageLoader.getSize.bind(ImageLoader);
          ImageLoader.getSize = function (url) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'image-loader'
            });

            return origGetSize(url).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                responseBody: JSON.stringify(result),
                source: 'image-loader'
              });
              return result;
            }).catch(function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'image-loader'
              });
              throw error;
            });
          };
        }

        if (typeof ImageLoader.prefetchImage === 'function' && !ImageLoader.__prefetchPatched) {
          ImageLoader.__prefetchPatched = true;
          var origPrefetch = ImageLoader.prefetchImage.bind(ImageLoader);
          ImageLoader.prefetchImage = function (url, requestId) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'image-prefetch'
            });

            return origPrefetch(url, requestId).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                source: 'image-prefetch'
              });
              return result;
            }).catch(function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'image-prefetch'
              });
              throw error;
            });
          };
        }

        if (typeof ImageLoader.queryCache === 'function' && !ImageLoader.__queryCachePatched) {
          ImageLoader.__queryCachePatched = true;
          var origQueryCache = ImageLoader.queryCache.bind(ImageLoader);
          ImageLoader.queryCache = function (urls) {
            var id = genId();
            var start = Date.now();
            var urlList = Array.isArray(urls) ? urls.join(', ') : String(urls);
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'CACHE', url: urlList.slice(0, 200), durationMs: 0,
              source: 'image-cache'
            });

            return origQueryCache(urls).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'CACHE', url: urlList.slice(0, 200), status: 200,
                durationMs: Date.now() - start,
                responseBody: JSON.stringify(result),
                source: 'image-cache'
              });
              return result;
            });
          };
        }
      }

      // Patch BlobModule for file uploads
      if (NativeModules && NativeModules.BlobModule) {
        var BlobModule = NativeModules.BlobModule;
        if (typeof BlobModule.sendOverSocket === 'function' && !BlobModule.__patched) {
          BlobModule.__patched = true;
          var origSendOverSocket = BlobModule.sendOverSocket.bind(BlobModule);
          BlobModule.sendOverSocket = function (blob, socketId) {
            logNetwork({
              id: genId(), phase: 'start', ts: new Date().toISOString(),
              method: 'BLOB', url: 'socket://' + socketId, durationMs: 0,
              requestBody: JSON.stringify({ size: blob && blob.size, type: blob && blob.type }),
              source: 'blob'
            });
            return origSendOverSocket(blob, socketId);
          };
        }
      }

      // Patch FileReaderModule
      if (NativeModules && NativeModules.FileReaderModule) {
        var FileReader = NativeModules.FileReaderModule;
        if (typeof FileReader.readAsDataURL === 'function' && !FileReader.__patched) {
          FileReader.__patched = true;
          var origReadAsDataURL = FileReader.readAsDataURL.bind(FileReader);
          FileReader.readAsDataURL = function (blob) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'READ', url: 'file://blob', durationMs: 0,
              source: 'file-reader'
            });

            return origReadAsDataURL(blob).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'READ', url: 'file://blob', status: 200,
                durationMs: Date.now() - start,
                responseBody: result ? result.slice(0, 100) + '...' : '',
                source: 'file-reader'
              });
              return result;
            });
          };
        }
      }
    } catch (e) {}

    // ============ WEBSOCKET SHIM ============
    try {
      var OriginalWebSocket = g.WebSocket;
      if (OriginalWebSocket && typeof OriginalWebSocket === 'function') {
        g.WebSocket = function (url, protocols) {
          var ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
          var id = genId();
          var start = Date.now();
          var messageCount = 0;

          logNetwork({
            id: id, phase: 'start', ts: new Date().toISOString(),
            method: 'WS', url: url || '', durationMs: 0,
            source: 'websocket'
          });

          ws.addEventListener('open', function () {
            logNetwork({
              id: id, phase: 'end', ts: new Date().toISOString(),
              method: 'WS', url: url || '', status: 101,
              durationMs: Date.now() - start,
              source: 'websocket'
            });
          });

          ws.addEventListener('message', function (e) {
            messageCount++;
            if (messageCount <= 10 || messageCount % 100 === 0) {
              logNetwork({
                id: id + '-msg-' + messageCount, phase: 'end', ts: new Date().toISOString(),
                method: 'WS-MSG', url: url || '', status: 200,
                durationMs: Date.now() - start,
                responseBody: truncateBody(e.data, 10000),
                source: 'ws-message'
              });
            }
          });

          ws.addEventListener('error', function (e) {
            logNetwork({
              id: id + '-err', phase: 'error', ts: new Date().toISOString(),
              method: 'WS', url: url || '', durationMs: Date.now() - start,
              error: 'WebSocket error',
              source: 'websocket'
            });
          });

          ws.addEventListener('close', function (e) {
            logNetwork({
              id: id + '-close', phase: 'end', ts: new Date().toISOString(),
              method: 'WS-CLOSE', url: url || '', status: e.code || 1000,
              durationMs: Date.now() - start,
              responseBody: 'Closed: ' + (e.reason || 'normal') + ' (messages: ' + messageCount + ')',
              source: 'websocket'
            });
          });

          // Also intercept send
          var origSend = ws.send;
          ws.send = function (data) {
            logNetwork({
              id: id + '-send-' + genId(), phase: 'start', ts: new Date().toISOString(),
              method: 'WS-SEND', url: url || '', durationMs: 0,
              requestBody: truncateBody(data, 10000),
              source: 'ws-send'
            });
            return origSend.call(ws, data);
          };

          return ws;
        };
        g.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
        g.WebSocket.OPEN = OriginalWebSocket.OPEN;
        g.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
        g.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
      }
    } catch (e) {}

    // ============ REACT NATIVE IMAGE COMPONENT ============
    try {
      var Image = require('react-native').Image;
      if (Image) {
        if (typeof Image.prefetch === 'function' && !Image.__prefetchPatched) {
          Image.__prefetchPatched = true;
          var origImgPrefetch = Image.prefetch;
          Image.prefetch = function (url) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'Image.prefetch'
            });

            return origImgPrefetch.call(Image, url).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                source: 'Image.prefetch'
              });
              return result;
            }).catch(function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'Image.prefetch'
              });
              throw error;
            });
          };
        }

        if (typeof Image.getSize === 'function' && !Image.__getSizePatched) {
          Image.__getSizePatched = true;
          var origImgGetSize = Image.getSize;
          Image.getSize = function (url, success, failure) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'Image.getSize'
            });

            return origImgGetSize.call(Image, url, function (width, height) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                responseBody: JSON.stringify({ width: width, height: height }),
                source: 'Image.getSize'
              });
              if (success) success(width, height);
            }, function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'Image.getSize'
              });
              if (failure) failure(error);
            });
          };
        }
      }
    } catch (e) {}

  } catch (eOuter) { console.log('RN Inspector network patch error:', eOuter); }
})();`;