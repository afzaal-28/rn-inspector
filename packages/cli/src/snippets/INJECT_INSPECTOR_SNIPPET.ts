export const INJECT_INSPECTOR_SNIPPET = `
(function () {
  try {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this;
    if (!g) return;
    if (g.__RN_INSPECTOR_UI_PATCHED__) return;
    g.__RN_INSPECTOR_UI_PATCHED__ = true;

    function serializeElement(element, depth) {
      if (!element || depth > 15) return null;
      
      var result = {
        type: null,
        props: {},
        children: [],
        layout: null
      };
      
      try {
        if (typeof element.type === 'string') {
          result.type = element.type;
        } else if (element.type && element.type.displayName) {
          result.type = element.type.displayName;
        } else if (element.type && element.type.name) {
          result.type = element.type.name;
        } else if (element.type) {
          result.type = 'Component';
        }
        
        if (element.props) {
          var propKeys = Object.keys(element.props);
          for (var i = 0; i < Math.min(propKeys.length, 20); i++) {
            var key = propKeys[i];
            if (key === 'children') continue;
            var val = element.props[key];
            var valType = typeof val;
            if (valType === 'string' || valType === 'number' || valType === 'boolean') {
              result.props[key] = val;
            } else if (valType === 'function') {
              result.props[key] = '[Function]';
            } else if (val === null) {
              result.props[key] = null;
            } else if (valType === 'object') {
              if (key === 'style') {
                try {
                  result.props[key] = JSON.parse(JSON.stringify(val));
                } catch (e) {
                  result.props[key] = '[Style Object]';
                }
              } else {
                result.props[key] = '[Object]';
              }
            }
          }
        }
        
        if (element.props && element.props.children) {
          var children = element.props.children;
          if (Array.isArray(children)) {
            for (var j = 0; j < Math.min(children.length, 50); j++) {
              var child = serializeElement(children[j], depth + 1);
              if (child) result.children.push(child);
            }
          } else if (typeof children === 'object' && children !== null) {
            var child = serializeElement(children, depth + 1);
            if (child) result.children.push(child);
          } else if (typeof children === 'string' || typeof children === 'number') {
            result.children.push({ type: 'Text', props: { text: String(children) }, children: [] });
          }
        }
      } catch (e) {
        result.error = e.message;
      }
      
      return result;
    }

    g.__RN_INSPECTOR_FETCH_UI__ = function(requestId) {
      var result = { requestId: requestId, hierarchy: null, screenshot: null, error: null };
      
      try {
        var hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook && hook.renderers) {
          var renderers = Array.from(hook.renderers.values());
          if (renderers.length > 0) {
            var renderer = renderers[0];
            if (renderer && renderer.findFiberByHostInstance) {
              var roots = hook.getFiberRoots ? hook.getFiberRoots(1) : null;
              if (roots && roots.size > 0) {
                var rootFiber = Array.from(roots)[0];
                if (rootFiber && rootFiber.current) {
                  result.hierarchy = serializeFiber(rootFiber.current, 0);
                }
              }
            }
          }
        }
        
        if (!result.hierarchy) {
          try {
            var AppRegistry = require('react-native').AppRegistry;
            if (AppRegistry && AppRegistry.getRunnable) {
              result.hierarchy = { type: 'AppRoot', props: {}, children: [], note: 'Full hierarchy requires React DevTools hook' };
            }
          } catch (e) {}
        }
        
        if (!result.hierarchy) {
          result.hierarchy = { type: 'Root', props: {}, children: [], note: 'Could not access component tree' };
        }
      } catch (e) {
        result.error = e.message;
      }
      
      console.log('__RN_INSPECTOR_UI__:' + JSON.stringify(result));
      
      function serializeFiber(fiber, depth) {
        if (!fiber || depth > 20) return null;
        
        var node = {
          type: null,
          props: {},
          children: [],
          key: fiber.key || null
        };
        
        try {
          if (typeof fiber.type === 'string') {
            node.type = fiber.type;
          } else if (fiber.type && fiber.type.displayName) {
            node.type = fiber.type.displayName;
          } else if (fiber.type && fiber.type.name) {
            node.type = fiber.type.name;
          } else if (fiber.tag === 5) {
            node.type = 'HostComponent';
          } else if (fiber.tag === 6) {
            node.type = 'Text';
          } else if (fiber.tag === 3) {
            node.type = 'HostRoot';
          } else {
            node.type = 'Unknown';
          }
          
          if (fiber.memoizedProps && typeof fiber.memoizedProps === 'object') {
            var props = fiber.memoizedProps;
            var keys = Object.keys(props);
            for (var i = 0; i < Math.min(keys.length, 15); i++) {
              var key = keys[i];
              if (key === 'children') continue;
              var val = props[key];
              var t = typeof val;
              if (t === 'string' || t === 'number' || t === 'boolean' || val === null) {
                node.props[key] = val;
              } else if (t === 'function') {
                node.props[key] = '[Function]';
              } else if (key === 'style' && t === 'object') {
                try { node.props[key] = JSON.parse(JSON.stringify(val)); } catch (e) { node.props[key] = '[Style]'; }
              } else {
                node.props[key] = '[' + t + ']';
              }
            }
          }
          
          if (fiber.tag === 6 && fiber.memoizedProps) {
            node.props.text = String(fiber.memoizedProps);
          }
          
          var child = fiber.child;
          while (child) {
            var serialized = serializeFiber(child, depth + 1);
            if (serialized) node.children.push(serialized);
            child = child.sibling;
          }
        } catch (e) {
          node.error = e.message;
        }
        
        return node;
      }
    };
  } catch (eOuter) {}
})();`;
