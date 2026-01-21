export const INJECT_NAVIGATION_SNIPPET = `
(function() {
  const globalAny = globalThis;
  if (globalAny.__RN_INSPECTOR_NAVIGATION_INSTALLED__) return;
  globalAny.__RN_INSPECTOR_NAVIGATION_INSTALLED__ = true;

  const navigationRef = { current: null };
  const navigationHistory = [];
  const MAX_HISTORY = 50;

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

  function captureNavigationState(navigation) {
    if (!navigation) return null;
    
    try {
      const state = navigation.getState();
      const currentRoute = navigation.getCurrentRoute();
      
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

  function extractRoutes(state) {
    if (!state) return [];
    const routes = [];
    
    function traverse(node) {
      if (node.routes) {
        node.routes.forEach(route => {
          routes.push({
            name: route.name,
            key: route.key,
            params: route.params,
          });
          if (route.state) {
            traverse(route.state);
          }
        });
      }
    }
    
    traverse(state);
    return routes;
  }

  function getAvailableRoutes(navigation) {
    if (!navigation) return [];
    
    try {
      const parent = navigation.getParent();
      const state = navigation.getState();
      const routes = [];

      if (state && state.routeNames) {
        state.routeNames.forEach(name => {
          const route = state.routes?.find(r => r.name === name);
          if (route) {
            routes.push({
              name: route.name,
              key: route.key,
            });
          } else {
            routes.push({
              name: name,
              key: name,
            });
          }
        });
      }

      if (state && state.routes) {
        state.routes.forEach(route => {
          if (route.state && route.state.routeNames) {
            route.state.routeNames.forEach(nestedName => {
              const nestedRoute = route.state.routes?.find(r => r.name === nestedName);
              if (nestedRoute) {
                routes.push({
                  name: nestedRoute.name,
                  key: nestedRoute.key,
                  parentKey: route.key,
                  parentName: route.name,
                });
              } else {
                routes.push({
                  name: nestedName,
                  key: nestedName,
                  parentKey: route.key,
                  parentName: route.name,
                });
              }
            });
          }
        });
      }

      if (parent) {
        const parentRoutes = getAvailableRoutes(parent);
        parentRoutes.forEach(route => routes.push(route));
      }

      const uniqueRoutes = routes.filter((route, index, self) => 
        index === self.findIndex(r => r.key === route.key)
      );

      return uniqueRoutes;
    } catch (err) {
      console.warn('[rn-inspector] Failed to get available routes:', err);
      return [];
    }
  }

  globalAny.__RN_INSPECTOR_NAVIGATION__ = {
    setNavigationRef: (ref) => {
      navigationRef.current = ref;
      
      if (ref) {
        const navState = captureNavigationState(ref);
        const availableRoutes = getAvailableRoutes(ref);
        
        sendNavigationEvent('ref-ready', {
          state: navState,
          availableRoutes,
        });

        sendNavigationEvent('state-change', {
          state: navState,
          history: navigationHistory.slice(0, 10),
          availableRoutes,
        });

        const unsubscribe = ref.addListener('state', () => {
          const state = captureNavigationState(ref);
          const currentRoute = ref.getCurrentRoute();
          
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

          sendNavigationEvent('state-change', {
            state,
            history: navigationHistory.slice(0, 10),
            availableRoutes: getAvailableRoutes(ref),
          });
        });

        // Also set up periodic state refresh every 5 seconds to ensure UI stays updated
        const periodicRefresh = setInterval(() => {
          if (navigationRef.current) {
            const state = captureNavigationState(navigationRef.current);
            sendNavigationEvent('state-change', {
              state,
              history: navigationHistory.slice(0, 10),
              availableRoutes: getAvailableRoutes(navigationRef.current),
            });
          }
        }, 5000);

        globalAny.__RN_INSPECTOR_NAVIGATION_UNSUB__ = () => {
          unsubscribe();
          clearInterval(periodicRefresh);
        };
      }
    },

    navigate: (routeName, params) => {
      if (!navigationRef.current) {
        console.warn('[rn-inspector] Navigation ref not set');
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        const navigation = navigationRef.current;
        const state = navigation.getState();

        let parentRoute = null;
        if (state && state.routes) {
          for (const route of state.routes) {
            if (route.state && route.state.routeNames && route.state.routeNames.includes(routeName)) {
              parentRoute = route;
              break;
            }
          }
        }

        if (parentRoute) {
          navigation.navigate(parentRoute.name, { 
            screen: routeName,
            params: params 
          });
          sendNavigationEvent('navigate', { routeName, params });
          console.log('[rn-inspector] Navigated to nested route:', routeName, 'in', parentRoute.name, params);
          return { success: true };
        } else {
          navigation.navigate(routeName, params);
          sendNavigationEvent('navigate', { routeName, params });
          console.log('[rn-inspector] Navigated to route:', routeName, params);
          return { success: true };
        }
      } catch (err) {
        console.error('[rn-inspector] Navigation error:', err);
        return { success: false, error: err.message };
      }
    },

    goBack: () => {
      if (!navigationRef.current) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        const navigation = navigationRef.current;
        
        if (navigation.canGoBack && navigation.canGoBack()) {
          navigation.goBack();
          sendNavigationEvent('go-back', {});
          console.log('[rn-inspector] Went back using goBack()');
          return { success: true };
        }
        
        if (typeof navigation.dispatch === 'function') {
          const NavigationActions = require('@react-navigation/native').CommonActions;
          navigation.dispatch(NavigationActions.goBack());
          sendNavigationEvent('go-back', {});
          console.log('[rn-inspector] Went back using dispatch');
          return { success: true };
        }
        
        try {
          const parent = navigation.getParent?.();
          if (parent && parent.canGoBack && parent.canGoBack()) {
            parent.goBack();
            sendNavigationEvent('go-back', {});
            console.log('[rn-inspector] Went back using parent navigator');
            return { success: true };
          }
        } catch (parentError) {
          console.warn('[rn-inspector] Parent goBack failed:', parentError);
        }
        
        return { success: false, error: 'Cannot go back - no available navigation history' };
      } catch (err) {
        console.error('[rn-inspector] Go back error:', err);
        return { success: false, error: err.message };
      }
    },

    replace: (routeName, params) => {
      if (!navigationRef.current) {
        console.warn('[rn-inspector] Navigation ref not set');
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        const navigation = navigationRef.current;
        const state = navigation.getState();

        let parentRoute = null;
        if (state && state.routes) {
          for (const route of state.routes) {
            if (route.state && route.state.routeNames && route.state.routeNames.includes(routeName)) {
              parentRoute = route;
              break;
            }
          }
        }

        if (parentRoute) {
          // Replace in parent with screen
          if (navigation.replace) {
            navigation.replace(parentRoute.name, { 
              screen: routeName,
              params: params 
            });
            sendNavigationEvent('replace', { routeName, params });
            console.log('[rn-inspector] Replaced with nested route:', routeName, 'in', parentRoute.name, params);
            return { success: true };
          }
        } else {
          // Direct replace
          if (navigation.replace) {
            navigation.replace(routeName, params);
            sendNavigationEvent('replace', { routeName, params });
            console.log('[rn-inspector] Replaced with route:', routeName, params);
            return { success: true };
          }
        }

        // Fallback: try dispatch with CommonActions
        if (typeof navigation.dispatch === 'function') {
          const NavigationActions = require('@react-navigation/native').CommonActions;
          navigation.dispatch(NavigationActions.replace(routeName, params));
          sendNavigationEvent('replace', { routeName, params });
          console.log('[rn-inspector] Replaced using dispatch:', routeName, params);
          return { success: true };
        }

        return { success: false, error: 'Replace method not available' };
      } catch (err) {
        console.error('[rn-inspector] Replace error:', err);
        return { success: false, error: err.message };
      }
    },

    reset: (state) => {
      if (!navigationRef.current) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        navigationRef.current.reset(state);
        sendNavigationEvent('reset', { state });
        console.log('[rn-inspector] Reset navigation to:', state);
        return { success: true };
      } catch (err) {
        console.error('[rn-inspector] Reset error:', err);
        return { success: false, error: err.message };
      }
    },

    dispatch: (action) => {
      if (!navigationRef.current) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        if (typeof navigationRef.current.dispatch === 'function') {
          navigationRef.current.dispatch(action);
          sendNavigationEvent('dispatch', { action });
          console.log('[rn-inspector] Dispatched action:', action);
          return { success: true };
        }
        return { success: false, error: 'Dispatch method not available' };
      } catch (err) {
        console.error('[rn-inspector] Dispatch error:', err);
        return { success: false, error: err.message };
      }
    },

    openUrl: (url) => {
      try {
        const Linking = require('react-native').Linking;
        Linking.openURL(url);
        sendNavigationEvent('open-url', { url });
        return { success: true };
      } catch (err) {
        console.error('[rn-inspector] Deep link error:', err);
        return { success: false, error: err.message };
      }
    },

    getState: () => {
      if (!navigationRef.current) {
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        const state = captureNavigationState(navigationRef.current);
        const availableRoutes = getAvailableRoutes(navigationRef.current);
        
        sendNavigationEvent('state-change', {
          state,
          history: navigationHistory.slice(0, 10),
          availableRoutes,
        });
        
        return {
          success: true,
          state,
          history: navigationHistory.slice(0, 10),
          availableRoutes,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    getHistory: () => {
      return navigationHistory;
    },
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__ = globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__ || {};
  
  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['navigate'] = (payload) => {
    const { routeName, params } = payload;
    return globalAny.__RN_INSPECTOR_NAVIGATION__.navigate(routeName, params);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['go-back'] = () => {
    return globalAny.__RN_INSPECTOR_NAVIGATION__.goBack();
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['reset-navigation'] = (payload) => {
    return globalAny.__RN_INSPECTOR_NAVIGATION__.reset(payload.state);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['open-url'] = (payload) => {
    return globalAny.__RN_INSPECTOR_NAVIGATION__.openUrl(payload.url);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['replace'] = (payload) => {
    const { routeName, params } = payload;
    return globalAny.__RN_INSPECTOR_NAVIGATION__.replace(routeName, params);
  };

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['dispatch-navigation'] = (payload) => {
    return globalAny.__RN_INSPECTOR_NAVIGATION__.dispatch(payload.action);
  };

  console.log('[rn-inspector] Navigation tracking installed');
  
  sendNavigationEvent('installed', {
    timestamp: new Date().toISOString(),
  });

  const checkAndAttachExistingRef = () => {
    try {
      // Check common global navigation ref patterns
      const possibleRefs = [
        globalAny.navigationRef?.current,
        globalAny.navigation?.current,
        globalAny.navigator?.current,
      ];

      for (const ref of possibleRefs) {
        if (ref && !navigationRef.current && ref) {
          if (typeof ref.navigate === 'function' && typeof ref.getCurrentRoute === 'function') {
            navigationRef.current = ref;
            const state = captureNavigationState(ref);
            const availableRoutes = getAvailableRoutes(ref);
            
            sendNavigationEvent('ref-ready', {
              state,
              availableRoutes,
            });
            
            sendNavigationEvent('state-change', {
              state,
              history: navigationHistory.slice(0, 10),
              availableRoutes,
            });
            
            console.log('[rn-inspector] Navigation state broadcasted:', {
              currentRoute: state?.currentRoute?.name,
              availableRoutes: availableRoutes.length,
            });

            const unsubscribe = ref.addListener('state', () => {
              const state = captureNavigationState(ref);
              const currentRoute = ref.getCurrentRoute();
              
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

              sendNavigationEvent('state-change', {
                state,
                history: navigationHistory.slice(0, 10),
                availableRoutes: getAvailableRoutes(ref),
              });
            });

            // Periodic refresh
            const periodicRefresh = setInterval(() => {
              if (navigationRef.current) {
                const state = captureNavigationState(navigationRef.current);
                sendNavigationEvent('state-change', {
                  state,
                  history: navigationHistory.slice(0, 10),
                  availableRoutes: getAvailableRoutes(navigationRef.current),
                });
              }
            }, 5000);

            globalAny.__RN_INSPECTOR_NAVIGATION_UNSUB__ = () => {
              unsubscribe();
              clearInterval(periodicRefresh);
            };
            
            return true;
          }
        }
      }
      
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
                  if (navRef && !navigationRef.current) {
                    navigationRef.current = navRef;
                    const state = captureNavigationState(navRef);
                    const availableRoutes = getAvailableRoutes(navRef);
                    
                    sendNavigationEvent('ref-ready', {
                      state,
                      availableRoutes,
                    });
                    
                    sendNavigationEvent('state-change', {
                      state,
                      history: navigationHistory.slice(0, 10),
                      availableRoutes,
                    });
                    
                    const unsubscribe = navRef.addListener('state', () => {
                      const state = captureNavigationState(navRef);
                      const currentRoute = navRef.getCurrentRoute();
                      
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

                      sendNavigationEvent('state-change', {
                        state,
                        history: navigationHistory.slice(0, 10),
                        availableRoutes: getAvailableRoutes(navRef),
                      });
                    });

                    // Periodic refresh
                    const periodicRefresh = setInterval(() => {
                      if (navigationRef.current) {
                        const state = captureNavigationState(navigationRef.current);
                        sendNavigationEvent('state-change', {
                          state,
                          history: navigationHistory.slice(0, 10),
                          availableRoutes: getAvailableRoutes(navigationRef.current),
                        });
                      }
                    }, 5000);

                    globalAny.__RN_INSPECTOR_NAVIGATION_UNSUB__ = () => {
                      unsubscribe();
                      clearInterval(periodicRefresh);
                    };
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
    } catch (err) {
      // Ignore errors
    }
    return false;
  };

  if (checkAndAttachExistingRef()) {
    console.log('[rn-inspector] Found existing navigation ref');
  } else {
    let pollAttempts = 0;
    const maxPollAttempts = 120;
    const pollInterval = setInterval(() => {
      pollAttempts++;
      
      if (navigationRef.current || checkAndAttachExistingRef()) {
        clearInterval(pollInterval);
        if (navigationRef.current) {
          const state = captureNavigationState(navigationRef.current);
          const availableRoutes = getAvailableRoutes(navigationRef.current);
          sendNavigationEvent('state-change', {
            state,
            history: navigationHistory.slice(0, 10),
            availableRoutes,
          });
          console.log('[rn-inspector] Initial navigation state broadcasted');
        }
      } else if (pollAttempts >= maxPollAttempts) {
        clearInterval(pollInterval);
      }
    }, 500);
  }
})();
`;
