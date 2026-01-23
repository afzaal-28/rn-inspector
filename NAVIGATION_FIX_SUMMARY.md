# Navigation Fix Summary

## Issues Fixed

### 1. Navigation Snippet Not Injected

**Problem**: The `INJECT_NAVIGATION_SNIPPET` was not being injected into the DevTools bridge when connecting to the React Native app.

**Solution**: Added navigation snippet injection in `@/home/afzaal/projects/rn-inspector/packages/cli/src/devtools/bridge.ts`:

- Imported `INJECT_NAVIGATION_SNIPPET`
- Added injection call (id: 8) alongside storage and network snippets

### 2. Navigation Events Not Handled

**Problem**: Navigation events from the injected snippet were not being processed by the DevTools bridge message handler.

**Solution**:

- Created `handleInjectedNavigationFromConsole` handler in `@/home/afzaal/projects/rn-inspector/packages/cli/src/devtools/handlers.ts`
- Integrated handler into bridge's `Runtime.consoleAPICalled` message processor
- Handler detects `__RN_INSPECTOR_NAVIGATION__` prefix and broadcasts navigation events

## How Navigation Works Now

### 1. Snippet Injection Flow

```
DevTools Bridge Connect
  → Runtime.enable
  → Log.enable
  → Network.enable
  → Page.enable
  → Fetch.enable
  → INJECT_STORAGE_SNIPPET (id: 6)
  → INJECT_NETWORK_SNIPPET (id: 7)
  → INJECT_NAVIGATION_SNIPPET (id: 8) ✅ NEW
```

### 2. Navigation Data Flow

```
React Native App
  → User calls setNavigationRef(navigationRef.current)
  → Snippet captures navigation state
  → Sends via console.log('__RN_INSPECTOR_NAVIGATION__:' + JSON.stringify(...))
  → DevTools Bridge receives Runtime.consoleAPICalled
  → handleInjectedNavigationFromConsole processes event
  → Broadcasts to navigationWss (ws://localhost:9234/inspector-navigation)
  → UI receives navigation data via WebSocket
```

### 3. Navigation Events Sent

- `installed`: When navigation snippet is first loaded
- `ref-ready`: When navigation ref is set with initial state
- `state-change`: When navigation state changes (route changes)
- `navigate`: When programmatic navigation occurs
- `go-back`: When back navigation occurs
- `reset`: When navigation is reset
- `open-url`: When deep link is opened

## WebSocket Architecture

### Port Allocation

- **9230**: Messages/Console (`/inspector-messages`)
- **9231**: Network (`/inspector-network`)
- **9232**: Storage (`/inspector-storage`)
- **9233**: Control (`/inspector-control`)
- **9234**: Navigation (`/inspector-navigation`) ✅

### inspector-control WebSocket Purpose

The **inspector-control** WebSocket (`ws://localhost:9233/inspector-control`) handles **bidirectional control commands** between the UI and the React Native app. It does NOT handle data streaming (that's done by the other WebSockets).

#### Commands Handled by inspector-control:

1. **Storage Operations** (via DevTools bridge):
   - `fetch-storage`: Request AsyncStorage and Redux state
   - `mutate-storage`: Update AsyncStorage or Redux values

2. **Navigation Commands** (via DevTools bridge):
   - `navigate`: Navigate to a specific route
   - `go-back`: Navigate back
   - `reset-navigation`: Reset navigation stack
   - `open-url`: Open deep link URL
   - `get-navigation-state`: Request current navigation state

3. **DevTools Management**:
   - `reconnect-devtools`: Reconnect to DevTools WebSocket

#### How Control Commands Work:

```
UI (NavigationPage.tsx)
  → Calls navigateToRoute('HomeScreen', { id: 123 })
  → useProxyStream sends via controlWs:
    {
      type: "control",
      command: "navigate",
      routeName: "HomeScreen",
      params: { id: 123 },
      deviceId: "device-123"
    }
  → CLI receives on controlWss
  → Finds DevTools bridge for deviceId
  → Executes via Runtime.evaluate:
    globalThis.__RN_INSPECTOR_CONTROL_HANDLERS__['navigate']({ routeName: "HomeScreen", params: { id: 123 } })
  → React Native app executes navigation
  → Navigation snippet detects state change
  → Sends navigation event back via console.log
  → Broadcast to navigationWss
  → UI receives updated navigation state
```

### Data Flow Separation

Each WebSocket has a specific purpose:

- **Messages WS**: Console logs, errors, warnings (read-only from RN app)
- **Network WS**: HTTP requests/responses (read-only from RN app)
- **Storage WS**: AsyncStorage & Redux state (read-only, but triggered by control commands)
- **Navigation WS**: Navigation state, history, routes (read-only from RN app)
- **Control WS**: Commands from UI to RN app (write-only from UI perspective)

This separation ensures:

1. Clean data streams without mixing concerns
2. Easy filtering and subscription on UI side
3. Independent reconnection handling
4. Scalable architecture for future features

## Testing the Fix

1. **Start the CLI**:

   ```bash
   npm run dev
   ```

2. **Start your React Native app** with the navigation setup:

   ```javascript
   import { useEffect, useRef } from 'react';
   import { NavigationContainer } from '@react-navigation/native';

   function AppNavigation() {
     const navigationRef = useRef(null);

     useEffect(() => {
       if (global.__RN_INSPECTOR_NAVIGATION__) {
         global.__RN_INSPECTOR_NAVIGATION__.setNavigationRef(navigationRef.current);
       }
     }, []);

     return (
       <NavigationContainer ref={navigationRef}>{/* Your navigation stack */}</NavigationContainer>
     );
   }
   ```

3. **Open the UI** at `http://localhost:3000`

4. **Navigate to Navigation page** - You should now see:
   - Current route information
   - Navigation history
   - Available routes
   - Working navigation controls

5. **Check WebSocket connection**:
   - Open browser DevTools → Network → WS
   - You should see `ws://localhost:9234/inspector-navigation` connected
   - Messages should appear when you navigate in your app

## What Was Wrong in Your Setup

Your React Native app code was **correct**:

```javascript
useEffect(() => {
  if (global.__RN_INSPECTOR_NAVIGATION__) {
    global.__RN_INSPECTOR_NAVIGATION__.setNavigationRef(navigationRef.current);
  }
}, []);
```

The problem was on the **CLI side** - the navigation snippet was never being injected into your app, so `global.__RN_INSPECTOR_NAVIGATION__` was always `undefined`. Now it will be properly injected and your existing code will work.
