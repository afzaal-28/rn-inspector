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
        // Auto-detect resourceType if not already set
        if (!payload.resourceType && payload.url) {
          var contentType = '';
          if (payload.responseHeaders) {
            var headers = payload.responseHeaders;
            for (var key in headers) {
              if (key.toLowerCase() === 'content-type') {
                contentType = headers[key];
                break;
              }
            }
          }
          payload.resourceType = detectResourceType(payload.url, contentType, payload.source || '');
        }
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
      // No truncation - capture full request/response bodies
      if (!text) return text;
      if (typeof text !== 'string') {
        try { text = JSON.stringify(text); } catch (e) { text = String(text); }
      }
      return text;
    }

    function genId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function detectResourceType(url, contentType, source) {
      url = (url || '').toLowerCase();
      contentType = (contentType || '').toLowerCase();
      source = (source || '').toLowerCase();

      // WebSocket detection
      if (source.indexOf('websocket') >= 0 || source.indexOf('ws-') >= 0 || source === 'socket' || url.indexOf('ws://') === 0 || url.indexOf('wss://') === 0) {
        return 'socket';
      }

      // Image detection
      if (source.indexOf('image') >= 0 || source.indexOf('img') >= 0 || contentType.indexOf('image/') >= 0) {
        return 'img';
      }
      var imgExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.heic', '.heif', '.avif'];
      for (var i = 0; i < imgExts.length; i++) {
        if (url.indexOf(imgExts[i]) >= 0) return 'img';
      }

      // Font detection
      if (contentType.indexOf('font/') >= 0 || contentType.indexOf('application/font') >= 0 || contentType.indexOf('application/x-font') >= 0) {
        return 'font';
      }
      var fontExts = ['.woff', '.woff2', '.ttf', '.otf', '.eot'];
      for (var j = 0; j < fontExts.length; j++) {
        if (url.indexOf(fontExts[j]) >= 0) return 'font';
      }

      // CSS detection
      if (contentType.indexOf('text/css') >= 0 || url.indexOf('.css') >= 0) {
        return 'css';
      }

      // JavaScript detection
      if (contentType.indexOf('javascript') >= 0 || contentType.indexOf('application/x-javascript') >= 0 || contentType.indexOf('text/javascript') >= 0) {
        return 'js';
      }
      var jsExts = ['.js', '.mjs', '.jsx', '.ts', '.tsx'];
      for (var k = 0; k < jsExts.length; k++) {
        if (url.indexOf(jsExts[k]) >= 0) return 'js';
      }

      // Media detection (audio/video)
      if (contentType.indexOf('video/') >= 0 || contentType.indexOf('audio/') >= 0) {
        return 'media';
      }
      var mediaExts = ['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.mov', '.avi', '.mkv', '.m3u8', '.mpd'];
      for (var m = 0; m < mediaExts.length; m++) {
        if (url.indexOf(mediaExts[m]) >= 0) return 'media';
      }

      // Document detection (HTML, XML, PDF, etc.)
      if (contentType.indexOf('text/html') >= 0 || contentType.indexOf('application/xhtml') >= 0) {
        return 'doc';
      }
      if (contentType.indexOf('application/pdf') >= 0 || contentType.indexOf('application/xml') >= 0 || contentType.indexOf('text/xml') >= 0) {
        return 'doc';
      }
      var docExts = ['.html', '.htm', '.xhtml', '.pdf', '.xml'];
      for (var d = 0; d < docExts.length; d++) {
        if (url.indexOf(docExts[d]) >= 0) return 'doc';
      }

      // Fetch/XHR detection (JSON, form data, API calls)
      if (contentType.indexOf('application/json') >= 0 || contentType.indexOf('text/plain') >= 0 || contentType.indexOf('application/x-www-form-urlencoded') >= 0 || contentType.indexOf('multipart/form-data') >= 0) {
        if (source === 'fetch') return 'fetch';
        if (source === 'xhr') return 'xhr';
        return 'fetch';
      }

      // Source-based fallback
      if (source === 'fetch') return 'fetch';
      if (source === 'xhr') return 'xhr';
      if (source.indexOf('native') >= 0 || source === 'rn-native' || source === 'rn-event') return 'fetch';

      return 'other';
    }

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

    try {
      var RN = require('react-native');
      var NativeModules = RN && RN.NativeModules;
      
      // Enhanced native network module interception
      if (NativeModules) {
        // Check for additional HTTP-related native modules dynamically
        Object.keys(NativeModules).forEach(function(moduleName) {
          var module = NativeModules[moduleName];
          if (!module || module.__patched) return;
          
          // Look for modules with HTTP-related methods
          var httpMethods = ['request', 'fetch', 'get', 'post', 'put', 'delete', 'upload', 'download', 'sendRequest'];
          var hasHttpMethod = httpMethods.some(function(method) {
            return typeof module[method] === 'function';
          });
          
          if (hasHttpMethod && (moduleName.toLowerCase().indexOf('network') >= 0 || 
              moduleName.toLowerCase().indexOf('http') >= 0 ||
              moduleName.toLowerCase().indexOf('fetch') >= 0 ||
              moduleName.toLowerCase().indexOf('request') >= 0)) {
            
            module.__patched = true;
            httpMethods.forEach(function(methodName) {
              if (typeof module[methodName] === 'function') {
                var origMethod = module[methodName].bind(module);
                module[methodName] = function() {
                  var id = genId();
                  var start = Date.now();
                  var args = Array.prototype.slice.call(arguments);
                  var url = args[0] || args[1] || '';
                  var method = methodName.toUpperCase();
                  
                  logNetwork({
                    id: id, phase: 'start', ts: new Date().toISOString(),
                    method: method, url: url, durationMs: 0,
                    requestBody: truncateBody(args[2] || args[3]),
                    source: 'native-' + moduleName
                  });
                  
                  var result = origMethod.apply(module, arguments);
                  if (result && typeof result.then === 'function') {
                    return result.then(function(res) {
                      logNetwork({
                        id: id, phase: 'end', ts: new Date().toISOString(),
                        method: method, url: url, status: res && res.status,
                        durationMs: Date.now() - start,
                        responseBody: truncateBody(res),
                        source: 'native-' + moduleName
                      });
                      return res;
                    }).catch(function(err) {
                      logNetwork({
                        id: id, phase: 'error', ts: new Date().toISOString(),
                        method: method, url: url,
                        durationMs: Date.now() - start,
                        error: String(err && err.message ? err.message : err),
                        source: 'native-' + moduleName
                      });
                      throw err;
                    });
                  }
                  return result;
                };
              }
            });
          }
        });

        // Original Networking module patch
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

    try {
      var RN2 = require('react-native');
      var NativeModules2 = RN2 && RN2.NativeModules;

      // Firebase Firestore Native Module
      if (NativeModules2 && NativeModules2.RNFBFirestoreModule && !NativeModules2.RNFBFirestoreModule.__patched) {
        var Firestore = NativeModules2.RNFBFirestoreModule;
        Firestore.__patched = true;

        // Patch common Firestore methods
        ['documentGet', 'documentSet', 'documentUpdate', 'documentDelete', 'collectionGet', 'queryGet'].forEach(function(methodName) {
          if (typeof Firestore[methodName] === 'function') {
            var orig = Firestore[methodName].bind(Firestore);
            Firestore[methodName] = function() {
              var id = genId();
              var start = Date.now();
              var args = Array.prototype.slice.call(arguments);
              var path = args[1] || args[0] || '';
              
              logNetwork({
                id: id, phase: 'start', ts: new Date().toISOString(),
                method: methodName.toUpperCase(), url: 'firestore://' + path, durationMs: 0,
                requestBody: truncateBody(JSON.stringify(args)),
                source: 'firestore',
                resourceType: 'fetch'
              });
              
              var result = orig.apply(Firestore, arguments);
              if (result && typeof result.then === 'function') {
                return result.then(function(res) {
                  logNetwork({
                    id: id, phase: 'end', ts: new Date().toISOString(),
                    method: methodName.toUpperCase(), url: 'firestore://' + path, status: 200,
                    durationMs: Date.now() - start,
                    responseBody: truncateBody(JSON.stringify(res)),
                    source: 'firestore',
                    resourceType: 'fetch'
                  });
                  return res;
                }).catch(function(err) {
                  logNetwork({
                    id: id, phase: 'error', ts: new Date().toISOString(),
                    method: methodName.toUpperCase(), url: 'firestore://' + path,
                    durationMs: Date.now() - start,
                    error: String(err && err.message ? err.message : err),
                    source: 'firestore',
                    resourceType: 'fetch'
                  });
                  throw err;
                });
              }
              return result;
            };
          }
        });
      }
      
      // Firebase Realtime Database Native Module
      if (NativeModules2 && NativeModules2.RNFBDatabaseModule && !NativeModules2.RNFBDatabaseModule.__patched) {
        var Database = NativeModules2.RNFBDatabaseModule;
        Database.__patched = true;
        
        ['once', 'set', 'update', 'remove', 'push'].forEach(function(methodName) {
          if (typeof Database[methodName] === 'function') {
            var orig = Database[methodName].bind(Database);
            Database[methodName] = function() {
              var id = genId();
              var start = Date.now();
              var args = Array.prototype.slice.call(arguments);
              var path = args[1] || args[0] || '';
　　 　 　 　
              logNetwork({
                id: id, phase: 'start', ts: new Date().toISOString(),
                method: 'RTDB_' + methodName.toUpperCase(), url: 'firebase-rtdb://' + path, durationMs: 0,
                requestBody: truncateBody(JSON.stringify(args)),
                source: 'firebase-rtdb',
                resourceType: 'fetch'
              });
　　 　 　 　
              var result = orig.apply(Database, arguments);
              if (result && typeof result.then === 'function') {
                return result.then(function(res) {
                  logNetwork({
                    id: id, phase: 'end', ts: new Date().toISOString(),
                    method: 'RTDB_' + methodName.toUpperCase(), url: 'firebase-rtdb://' + path, status: 200,
                    durationMs: Date.now() - start,
                    responseBody: truncateBody(JSON.stringify(res)),
                    source: 'firebase-rtdb',
                    resourceType: 'fetch'
                  });
                  return res;
                }).catch(function(err) {
                  logNetwork({
                    id: id, phase: 'error', ts: new Date().toISOString(),
                    method: 'RTDB_' + methodName.toUpperCase(), url: 'firebase-rtdb://' + path,
                    durationMs: Date.now() - start,
                    error: String(err && err.message ? err.message : err),
                    source: 'firebase-rtdb',
                    resourceType: 'fetch'
                  });
                  throw err;
                });
              }
              return result;
            };
          }
        });
      }
      
      // Firebase Auth Native Module
      if (NativeModules2 && NativeModules2.RNFBAuthModule && !NativeModules2.RNFBAuthModule.__patched) {
        var Auth = NativeModules2.RNFBAuthModule;
        Auth.__patched = true;
        
        ['signInWithEmailAndPassword', 'createUserWithEmailAndPassword', 'signInAnonymously', 'signOut', 'getCurrentUser'].forEach(function(methodName) {
          if (typeof Auth[methodName] === 'function') {
            var orig = Auth[methodName].bind(Auth);
            Auth[methodName] = function() {
              var id = genId();
              var start = Date.now();
　　 　 　 　
              logNetwork({
                id: id, phase: 'start', ts: new Date().toISOString(),
                method: 'AUTH_' + methodName.toUpperCase(), url: 'firebase-auth://' + methodName, durationMs: 0,
                source: 'firebase-auth',
                resourceType: 'fetch'
              });
　　 　 　 　
              var result = orig.apply(Auth, arguments);
              if (result && typeof result.then === 'function') {
                return result.then(function(res) {
                  logNetwork({
                    id: id, phase: 'end', ts: new Date().toISOString(),
                    method: 'AUTH_' + methodName.toUpperCase(), url: 'firebase-auth://' + methodName, status: 200,
                    durationMs: Date.now() - start,
                    responseBody: res ? '[User data]' : null,
                    source: 'firebase-auth',
                    resourceType: 'fetch'
                  });
                  return res;
                }).catch(function(err) {
                  logNetwork({
                    id: id, phase: 'error', ts: new Date().toISOString(),
                    method: 'AUTH_' + methodName.toUpperCase(), url: 'firebase-auth://' + methodName,
                    durationMs: Date.now() - start,
                    error: String(err && err.message ? err.message : err),
                    source: 'firebase-auth',
                    resourceType: 'fetch'
                  });
                  throw err;
                });
              }
              return result;
            };
          }
        });
      }
      
      // Firebase Storage Native Module
      if (NativeModules2 && NativeModules2.RNFBStorageModule && !NativeModules2.RNFBStorageModule.__patched) {
        var Storage = NativeModules2.RNFBStorageModule;
        Storage.__patched = true;
        
        ['getDownloadURL', 'putFile', 'putString', 'deleteFile', 'getMetadata'].forEach(function(methodName) {
          if (typeof Storage[methodName] === 'function') {
            var orig = Storage[methodName].bind(Storage);
            Storage[methodName] = function() {
              var id = genId();
              var start = Date.now();
              var args = Array.prototype.slice.call(arguments);
              var path = args[1] || args[0] || '';
　　 　 　 　
              logNetwork({
                id: id, phase: 'start', ts: new Date().toISOString(),
                method: 'STORAGE_' + methodName.toUpperCase(), url: 'firebase-storage://' + path, durationMs: 0,
                source: 'firebase-storage',
                resourceType: 'fetch'
              });
　　 　 　 　
              var result = orig.apply(Storage, arguments);
              if (result && typeof result.then === 'function') {
                return result.then(function(res) {
                  logNetwork({
                    id: id, phase: 'end', ts: new Date().toISOString(),
                    method: 'STORAGE_' + methodName.toUpperCase(), url: 'firebase-storage://' + path, status: 200,
                    durationMs: Date.now() - start,
                    responseBody: truncateBody(JSON.stringify(res)),
                    source: 'firebase-storage',
                    resourceType: 'fetch'
                  });
                  return res;
                }).catch(function(err) {
                  logNetwork({
                    id: id, phase: 'error', ts: new Date().toISOString(),
                    method: 'STORAGE_' + methodName.toUpperCase(), url: 'firebase-storage://' + path,
                    durationMs: Date.now() - start,
                    error: String(err && err.message ? err.message : err),
                    source: 'firebase-storage',
                    resourceType: 'fetch'
                  });
                  throw err;
                });
              }
              return result;
            };
          }
        });
      }
    } catch (e) {}

    // Intercept global Promise-based HTTP libraries (axios instance interception)
    try {
      if (g.axios && !g.axios.__patched) {
        g.axios.__patched = true;
        var origAxios = g.axios;
        
        // Intercept axios.request and similar methods
        ['request', 'get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(function(method) {
          if (typeof origAxios[method] === 'function') {
            var origMethod = origAxios[method].bind(origAxios);
            origAxios[method] = function() {
              var id = genId();
              var start = Date.now();
              var args = Array.prototype.slice.call(arguments);
              var config = method === 'request' ? args[0] : (typeof args[0] === 'string' ? { url: args[0] } : args[0]);
              var url = config && config.url ? config.url : '';
              var httpMethod = config && config.method ? config.method.toUpperCase() : method.toUpperCase();
　　 　 　 　
              logNetwork({
                id: id, phase: 'start', ts: new Date().toISOString(),
                method: httpMethod, url: url, durationMs: 0,
                requestHeaders: config && config.headers ? toPlainHeaders(config.headers) : {},
                requestBody: config && config.data ? truncateBody(config.data) : undefined,
                source: 'axios',
                resourceType: 'fetch'
              });
　　 　 　 　
              return origMethod.apply(origAxios, arguments).then(function(res) {
                logNetwork({
                  id: id, phase: 'end', ts: new Date().toISOString(),
                  method: httpMethod, url: url, status: res && res.status,
                  durationMs: Date.now() - start,
                  responseHeaders: res && res.headers ? toPlainHeaders(res.headers) : {},
                  responseBody: res && res.data ? truncateBody(res.data) : undefined,
                  source: 'axios',
                  resourceType: 'fetch'
                });
                return res;
              }).catch(function(err) {
                logNetwork({
                  id: id, phase: 'error', ts: new Date().toISOString(),
                  method: httpMethod, url: url,
                  durationMs: Date.now() - start,
                  error: String(err && err.message ? err.message : err),
                  responseBody: err && err.response && err.response.data ? truncateBody(err.response.data) : undefined,
                  source: 'axios',
                  resourceType: 'fetch'
                });
                throw err;
              });
            };
          }
        });
      }
    } catch (e) {}

  } catch (eOuter) { console.log('RN Inspector network patch error:', eOuter); }
})();`;
