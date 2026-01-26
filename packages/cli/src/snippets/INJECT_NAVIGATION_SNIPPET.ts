export const INJECT_NAVIGATION_SNIPPET = `
(function() {
  'use strict';
  
  const globalAny = globalThis;
  if (globalAny.__RN_INSPECTOR_NAVIGATION_INSTALLED__) return;
  globalAny.__RN_INSPECTOR_NAVIGATION_INSTALLED__ = true;

  let navigationRef = null;
  let navigationContainerRef = null;
  let stateListener = null;
  let focusListener = null;
  const navigationHistory = [];
  const MAX_HISTORY = 50;
  const availableRoutes = new Map();

  function sendNavigationEvent(type, payload) {
    try {
      const data = {
        type,
        ...payload,
        timestamp: new Date().toISOString(),
      };
      if (typeof console !== 'undefined' && console.log) {
        console.log('__RN_INSPECTOR_NAVIGATION__:' + JSON.stringify(data));
      }
    } catch (e) {
      // Ignore serialization errors
    }
  }

  function captureNavigationState(nav) {
    if (!nav) return null;
    
    try {
      const state = nav.getState();
      const currentRoute = nav.getCurrentRoute();
      
      return {
        state,
        currentRoute: currentRoute ? {
          name: currentRoute.name,
          key: currentRoute.key,
          params: currentRoute.params,
          path: currentRoute.path,
        } : null,
      };
    } catch (err) {
      console.warn('[rn-inspector] Failed to capture navigation state:', err);
      return null;
    }
  }

  function extractRoutesFromState(state) {
    const routes = [];
    
    function traverse(node, parentKey = null, parentName = null) {
      if (!node) return;
      
      if (node.routes) {
        node.routes.forEach(route => {
          if (route.name) {
            routes.push({
              name: route.name,
              key: route.key,
              params: route.params,
              parentKey,
              parentName,
            });
          }
          if (route.state) {
            traverse(route.state, route.key, route.name);
          }
        });
      }
    }
    
    traverse(state);
    return routes;
  }

  function updateAvailableRoutes(nav) {
    if (!nav) return;
    
    try {
      const state = nav.getState();
      const routes = extractRoutesFromState(state);
      
      // Clear and update available routes
      availableRoutes.clear();
      routes.forEach(route => {
        availableRoutes.set(route.key, route);
      });
      
      return routes;
    } catch (err) {
      console.warn('[rn-inspector] Failed to update available routes:', err);
      return [];
    }
  }

  function onNavigationStateChange(nav) {
    try {
      const state = captureNavigationState(nav);
      const currentRoute = nav.getCurrentRoute();
      
      if (currentRoute) {
        const historyEntry = {
          name: currentRoute.name,
          key: currentRoute.key,
          params: currentRoute.params,
          timestamp: new Date().toISOString(),
        };
        
        navigationHistory.unshift(historyEntry);
        if (navigationHistory.length > MAX_HISTORY) {
          navigationHistory.pop();
        }
      }

      updateAvailableRoutes(nav);

      sendNavigationEvent('state-change', {
        state,
        history: navigationHistory.slice(0, 10),
        availableRoutes: Array.from(availableRoutes.values()),
      });
    } catch (err) {
      console.error('[rn-inspector] Error in navigation state change:', err);
    }
  }

  function setupNavigationListeners(nav) {
    try {
      // Clean up existing listeners
      if (stateListener) {
        nav.removeListener('state', stateListener);
        stateListener = null;
      }
      if (focusListener) {
        nav.removeListener('focus', focusListener);
        focusListener = null;
      }

      // Set up state listener
      stateListener = nav.addListener('state', () => {
        onNavigationStateChange(nav);
      });

      // Set up focus listener for better tracking
      focusListener = nav.addListener('focus', () => {
        onNavigationStateChange(nav);
      });

    } catch (err) {
      console.warn('[rn-inspector] Failed to setup navigation listeners:', err);
    }
  }

  function cleanupNavigationListeners(nav) {
    try {
      if (nav && stateListener) {
        nav.removeListener('state', stateListener);
      }
      if (nav && focusListener) {
        nav.removeListener('focus', focusListener);
      }
      stateListener = null;
      focusListener = null;
    } catch (err) {
      console.warn('[rn-inspector] Failed to cleanup listeners:', err);
    }
  }

  // Main navigation API
  globalAny.__RN_INSPECTOR_NAVIGATION__ = {
    setNavigationRef: function(ref) {
      try {
        cleanupNavigationListeners(navigationRef);
        
        navigationRef = ref;
        
        if (ref) {
          const state = captureNavigationState(ref);
          const routes = updateAvailableRoutes(ref);
          
          sendNavigationEvent('ref-ready', {
            state,
            availableRoutes: routes,
          });

          sendNavigationEvent('state-change', {
            state,
            history: navigationHistory.slice(0, 10),
            availableRoutes: routes,
          });

          setupNavigationListeners(ref);
          
          console.log('[rn-inspector] Navigation ref attached successfully');
        }
      } catch (err) {
        console.error('[rn-inspector] Error setting navigation ref:', err);
      }
    },

    setNavigationContainerRef: function(ref) {
      try {
        navigationContainerRef = ref;
        
        if (ref && ref.getCurrentRoute) {
          this.setNavigationRef(ref);
          console.log('[rn-inspector] Navigation container ref attached');
        }
      } catch (err) {
        console.error('[rn-inspector] Error setting navigation container ref:', err);
      }
    },

    navigate: function(routeName, params) {
      if (!navigationRef) {
        console.warn('[rn-inspector] Navigation ref not set');
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        // Try standard navigation first
        if (typeof navigationRef.navigate === 'function') {
          navigationRef.navigate(routeName, params);
          sendNavigationEvent('navigate', { routeName, params });
          console.log('[rn-inspector] Navigated to:', routeName, params);
          return { success: true };
        }
        
        // Try dispatch method
        if (typeof navigationRef.dispatch === 'function') {
          const NavigationActions = require('@react-navigation/native').CommonActions;
          navigationRef.dispatch(NavigationActions.navigate(routeName, params));
          sendNavigationEvent('navigate', { routeName, params });
          console.log('[rn-inspector] Dispatched navigation to:', routeName);
          return { success: true };
        }

        return { success: false, error: 'Navigate method not available' };
      } catch (err) {
        console.error('[rn-inspector] Navigation error:', err);
        return { success: false, error: err.message };
      }
    },

    goBack: function() {
      if (!navigationRef) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        // Try standard goBack
        if (typeof navigationRef.goBack === 'function') {
          if (navigationRef.canGoBack && !navigationRef.canGoBack()) {
            return { success: false, error: 'Cannot go back - no history' };
          }
          navigationRef.goBack();
          sendNavigationEvent('go-back', {});
          console.log('[rn-inspector] Went back');
          return { success: true };
        }
        
        // Try dispatch
        if (typeof navigationRef.dispatch === 'function') {
          const NavigationActions = require('@react-navigation/native').CommonActions;
          navigationRef.dispatch(NavigationActions.goBack());
          sendNavigationEvent('go-back', {});
          console.log('[rn-inspector] Dispatched goBack');
          return { success: true };
        }

        return { success: false, error: 'Go back method not available' };
      } catch (err) {
        console.error('[rn-inspector] Go back error:', err);
        return { success: false, error: err.message };
      }
    },

    replace: function(routeName, params) {
      if (!navigationRef) {
        console.warn('[rn-inspector] Navigation ref not set');
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        if (typeof navigationRef.replace === 'function') {
          navigationRef.replace(routeName, params);
          sendNavigationEvent('replace', { routeName, params });
          console.log('[rn-inspector] Replaced with:', routeName);
          return { success: true };
        }
        
        if (typeof navigationRef.dispatch === 'function') {
          const NavigationActions = require('@react-navigation/native').CommonActions;
          navigationRef.dispatch(NavigationActions.replace(routeName, params));
          sendNavigationEvent('replace', { routeName, params });
          console.log('[rn-inspector] Dispatched replace:', routeName);
          return { success: true };
        }

        return { success: false, error: 'Replace method not available' };
      } catch (err) {
        console.error('[rn-inspector] Replace error:', err);
        return { success: false, error: err.message };
      }
    },

    reset: function(state) {
      if (!navigationRef) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        if (typeof navigationRef.reset === 'function') {
          navigationRef.reset(state);
          sendNavigationEvent('reset', { state });
          console.log('[rn-inspector] Reset navigation');
          return { success: true };
        }
        
        if (typeof navigationRef.dispatch === 'function') {
          const NavigationActions = require('@react-navigation/native').CommonActions;
          navigationRef.dispatch(NavigationActions.reset(state));
          sendNavigationEvent('reset', { state });
          console.log('[rn-inspector] Dispatched reset');
          return { success: true };
        }

        return { success: false, error: 'Reset method not available' };
      } catch (err) {
        console.error('[rn-inspector] Reset error:', err);
        return { success: false, error: err.message };
      }
    },

    dispatch: function(action) {
      if (!navigationRef) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        if (typeof navigationRef.dispatch === 'function') {
          navigationRef.dispatch(action);
          sendNavigationEvent('dispatch', { action });
          console.log('[rn-inspector] Dispatched action');
          return { success: true };
        }
        return { success: false, error: 'Dispatch method not available' };
      } catch (err) {
        console.error('[rn-inspector] Dispatch error:', err);
        return { success: false, error: err.message };
      }
    },

    openUrl: function(url) {
      try {
        const Linking = require('react-native').Linking;
        Linking.openURL(url);
        sendNavigationEvent('open-url', { url });
        console.log('[rn-inspector] Opened URL:', url);
        return { success: true };
      } catch (err) {
        console.error('[rn-inspector] Open URL error:', err);
        return { success: false, error: err.message };
      }
    },

    getState: function() {
      if (!navigationRef) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        const state = captureNavigationState(navigationRef);
        const routes = Array.from(availableRoutes.values());
        
        sendNavigationEvent('state-change', {
          state,
          history: navigationHistory.slice(0, 10),
          availableRoutes: routes,
        });
        
        return {
          success: true,
          state,
          history: navigationHistory.slice(0, 10),
          availableRoutes: routes,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    getHistory: function() {
      return navigationHistory;
    },
  };

  // Control handlers for remote control
  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__ = globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__ || {};
  
  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['navigate'] = function(payload) {
    const { routeName, params } = payload;
    
    // Try to attach ref if not set
    if (!navigationRef) {
      tryAttachExistingRef();
    }
    
    return globalAny.__RN_INSPECTOR_NAVIGATION__.navigate(routeName, params);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['go-back'] = function() {
    // Try to attach ref if not set
    if (!navigationRef) {
      tryAttachExistingRef();
    }
    
    return globalAny.__RN_INSPECTOR_NAVIGATION__.goBack();
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['reset-navigation'] = function(payload) {
    const { state } = payload;
    
    // Try to attach ref if not set
    if (!navigationRef) {
      tryAttachExistingRef();
    }
    
    return globalAny.__RN_INSPECTOR_NAVIGATION__.reset(state);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['open-url'] = function(payload) {
    const { url } = payload;
    return globalAny.__RN_INSPECTOR_NAVIGATION__.openUrl(url);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['replace'] = function(payload) {
    const { routeName, params } = payload;
    
    // Try to attach ref if not set
    if (!navigationRef) {
      tryAttachExistingRef();
    }
    
    return globalAny.__RN_INSPECTOR_NAVIGATION__.replace(routeName, params);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['dispatch-navigation'] = function(payload) {
    const { action } = payload;
    
    // Try to attach ref if not set
    if (!navigationRef) {
      tryAttachExistingRef();
    }
    
    return globalAny.__RN_INSPECTOR_NAVIGATION__.dispatch(action);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['get-navigation-state'] = function() {
    // Try to attach ref if not set
    if (!navigationRef) {
      tryAttachExistingRef();
    }
    
    return globalAny.__RN_INSPECTOR_NAVIGATION__.getState();
  };

  console.log('[rn-inspector] Navigation tracking installed');

  sendNavigationEvent('installed', {
    timestamp: new Date().toISOString(),
  });

  // Try to attach to existing navigation ref
  function tryAttachExistingRef() {
    try {
      // Check for standard navigation ref
      const possibleRefs = [
        globalAny.navigationRef?.current,
        globalAny.navigation?.current,
        globalAny.navigator?.current,
        globalAny.rootNavigation?.current,
      ];

      for (const ref of possibleRefs) {
        if (ref && typeof ref.navigate === 'function' && typeof ref.getCurrentRoute === 'function') {
          globalAny.__RN_INSPECTOR_NAVIGATION__.setNavigationRef(ref);
          console.log('[rn-inspector] Attached to existing navigation ref');
          return true;
        }
      }

      // Try to find navigation in React Native app registry
      try {
        const AppRegistry = require('react-native').AppRegistry;
        const apps = AppRegistry.getRunnable ? AppRegistry.getRunnable() : null;
        
        if (apps) {
          for (const appKey in apps) {
            try {
              const appInstance = apps[appKey];
              if (appInstance && appInstance.componentProvider) {
                const rootComponent = appInstance.componentProvider();
                if (rootComponent && rootComponent._owner) {
                  const findNavInFiber = (fiber, depth = 0) => {
                    if (depth > 20 || !fiber) return null;
                    
                    if (fiber.memoizedProps && fiber.memoizedProps.children) {
                      const props = fiber.memoizedProps;
                      if (props.ref && props.ref.current) {
                        const ref = props.ref.current;
                        if (ref && typeof ref.navigate === 'function' && typeof ref.getCurrentRoute === 'function') {
                          return ref;
                        }
                      }
                    }
                    
                    if (fiber.child) {
                      const found = findNavInFiber(fiber.child, depth + 1);
                      if (found) return found;
                    }
                    
                    if (fiber.sibling) {
                      const found = findNavInFiber(fiber.sibling, depth + 1);
                      if (found) return found;
                    }
                    
                    return null;
                  };
                  
                  const navRef = findNavInFiber(rootComponent._owner);
                  if (navRef) {
                    globalAny.__RN_INSPECTOR_NAVIGATION__.setNavigationRef(navRef);
                    console.log('[rn-inspector] Found navigation ref in component tree');
                    return true;
                  }
                }
              }
            } catch (err) {
              // Continue checking other apps
            }
          }
        }
      } catch (err) {
        // Ignore AppRegistry errors
      }

      return false;
    } catch (err) {
      console.warn('[rn-inspector] Error attaching to existing ref:', err);
      return false;
    }
  }

  // Try to attach immediately
  if (tryAttachExistingRef()) {
    console.log('[rn-inspector] Successfully attached to existing navigation');
  } else {
    // Poll for navigation ref
    let pollAttempts = 0;
    const maxPollAttempts = 120;
    const pollInterval = setInterval(() => {
      pollAttempts++;
      
      if (tryAttachExistingRef() || pollAttempts >= maxPollAttempts) {
        clearInterval(pollInterval);
      }
    }, 500);
  }
})();
`;
