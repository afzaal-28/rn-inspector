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
      const routes = new Set();

      if (state && state.routeNames) {
        state.routeNames.forEach(name => routes.add(name));
      }

      if (parent) {
        const parentRoutes = getAvailableRoutes(parent);
        parentRoutes.forEach(name => routes.add(name));
      }

      return Array.from(routes);
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

        globalAny.__RN_INSPECTOR_NAVIGATION_UNSUB__ = unsubscribe;
      }
    },

    navigate: (routeName, params) => {
      if (!navigationRef.current) {
        console.warn('[rn-inspector] Navigation ref not set');
        return { success: false, error: 'Navigation ref not set' };
      }

      try {
        navigationRef.current.navigate(routeName, params);
        sendNavigationEvent('navigate', { routeName, params });
        return { success: true };
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
        if (navigationRef.current.canGoBack()) {
          navigationRef.current.goBack();
          sendNavigationEvent('go-back', {});
          return { success: true };
        }
        return { success: false, error: 'Cannot go back' };
      } catch (err) {
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
        return { success: true };
      } catch (err) {
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

  globalAny.__RN_INSPECTOR_CONTROL_HANDLERS__['get-navigation-state'] = () => {
    return globalAny.__RN_INSPECTOR_NAVIGATION__.getState();
  };

  console.log('[rn-inspector] Navigation tracking installed');
  
  sendNavigationEvent('installed', {
    timestamp: new Date().toISOString(),
  });
})();
`;
