# Navigation Inspection Setup Guide

## Overview

The rn-inspector now supports end-to-end navigation inspection and control for React Native apps using React Navigation. This feature allows you to:

- **Monitor navigation state** in real-time
- **View navigation history** with timestamps and params
- **Navigate programmatically** to any route with custom params
- **Execute deep links** to test app URL handling
- **Control navigation** with back navigation and state reset

## React Native App Setup

### 1. Install the Navigation Snippet

Add the navigation inspection alias to your React Native app's entry point (e.g., `App.tsx` or `index.js`):

```typescript
import { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';

function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    // Set the navigation ref for rn-inspector
    if (global.__RN_INSPECTOR_NAVIGATION__) {
      global.__RN_INSPECTOR_NAVIGATION__.setNavigationRef(navigationRef.current);
    }
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      {/* Your navigation stack */}
    </NavigationContainer>
  );
}
```

### 2. Inject the Navigation Snippet

The navigation snippet is automatically injected when you connect to the rn-inspector. The snippet provides:

- **`__RN_INSPECTOR_NAVIGATION__`**: Global object with navigation helpers
- **Navigation event tracking**: Automatically broadcasts navigation state changes
- **Command handlers**: Responds to navigation commands from the inspector UI

### 3. Available Navigation Commands

The following commands are available through the inspector:

#### Navigate to Route

```javascript
global.__RN_INSPECTOR_NAVIGATION__.navigate('ScreenName', { id: 123 });
```

#### Go Back

```javascript
global.__RN_INSPECTOR_NAVIGATION__.goBack();
```

#### Open Deep Link

```javascript
global.__RN_INSPECTOR_NAVIGATION__.openUrl('myapp://screen/details?id=123');
```

#### Get Navigation State

```javascript
global.__RN_INSPECTOR_NAVIGATION__.getState();
```

## Inspector UI Features

### Navigation Page

Access the Navigation page from the sidebar menu. The page displays:

#### 1. Current Route

- Route name
- Route key
- Route path (if available)
- Route params (expandable JSON view)

#### 2. Navigation History

- Last 10 navigation events
- Timestamps for each navigation
- Route params for each entry
- Scrollable list of historical routes

#### 3. Navigate to Route

- List of available routes (clickable chips)
- Route name input field
- JSON params editor with validation
- Navigate button to execute navigation

#### 4. Deep Link

- URL input field for deep links
- Open button to execute deep link
- Supports custom URL schemes

#### 5. Navigation Controls

- Go Back button
- Full navigation state viewer (expandable JSON)

## WebSocket Communication

### Navigation WebSocket Path

```
ws://localhost:9234/inspector-navigation
```

### Navigation Event Format

```typescript
{
  type: "navigation",
  payload: {
    type: "state-change" | "navigate" | "go-back" | "open-url" | "installed" | "ref-ready",
    state?: {
      state: object,
      currentRoute: {
        name: string,
        key: string,
        params?: object,
        path?: string
      }
    },
    history?: Array<{
      name: string,
      key: string,
      params?: object,
      timestamp: string
    }>,
    availableRoutes?: string[],
    routeName?: string,
    params?: object,
    url?: string
  },
  timestamp: string,
  deviceId: string
}
```

### Navigation Command Format

```typescript
{
  type: "control",
  command: "navigate" | "go-back" | "reset-navigation" | "open-url" | "get-navigation-state",
  routeName?: string,
  params?: object,
  state?: object,
  url?: string,
  deviceId?: string
}
```

## CLI Configuration

### New Constants

- `UI_WS_NAVIGATION_PATH`: `/inspector-navigation`
- `CONTROL_CMD_NAVIGATE`: `"navigate"`
- `CONTROL_CMD_GO_BACK`: `"go-back"`
- `CONTROL_CMD_RESET_NAVIGATION`: `"reset-navigation"`
- `CONTROL_CMD_OPEN_URL`: `"open-url"`
- `CONTROL_CMD_GET_NAVIGATION_STATE`: `"get-navigation-state"`

### WebSocket Ports

- Messages: `9230`
- Network: `9231`
- Storage: `9232`
- Control: `9233`
- **Navigation: `9234`** (new)

## Architecture

### CLI Layer

1. **Navigation Snippet** (`INJECT_NAVIGATION_SNIPPET.ts`): Injected into React Native app
2. **Navigation Types** (`types/Index.ts`): TypeScript types for navigation events
3. **Navigation WebSocket Server**: Dedicated WebSocket for navigation events
4. **Control Command Handlers**: Process navigation commands from UI

### UI Layer

1. **Navigation Hook** (`useProxyStream.ts`): WebSocket connection and state management
2. **Navigation Context** (`ProxyContext.tsx`): Global navigation state provider
3. **Navigation Page** (`NavigationPage.tsx`): UI for navigation inspection and control
4. **Navigation Route**: `/navigation` in the app router

## Troubleshooting

### Navigation ref not set

**Issue**: "No current route information available" message appears.

**Solution**: Ensure you've set the navigation ref in your React Native app:

```typescript
global.__RN_INSPECTOR_NAVIGATION__?.setNavigationRef(navigationRef.current);
```

### No available routes detected

**Issue**: Available routes list is empty.

**Solution**:

- Verify React Navigation is properly configured
- Check that the navigation container has route names defined
- Ensure the app is running and connected to the inspector

### Deep links not working

**Issue**: Deep links don't open in the app.

**Solution**:

- Verify your app has deep linking configured
- Check the URL scheme matches your app's configuration
- Ensure `react-native` Linking module is available

### Navigation commands not executing

**Issue**: Navigation commands from UI don't affect the app.

**Solution**:

- Check DevTools connection status (should be "connected")
- Verify the correct device is selected
- Ensure the navigation snippet is properly injected

## Best Practices

1. **Set navigation ref early**: Set the ref in `useEffect` after the NavigationContainer mounts
2. **Test deep links**: Use the deep link feature to test your app's URL handling
3. **Monitor history**: Use navigation history to debug navigation flows
4. **Validate params**: Use the JSON params editor to test different parameter combinations
5. **Multi-device testing**: Switch between devices to test navigation on different platforms

## Example Usage

### Testing a Product Details Screen

1. Navigate to the Navigation page
2. Select "ProductDetails" from available routes
3. Enter params: `{"productId": "123", "variant": "blue"}`
4. Click "Navigate"
5. Observe the navigation in your app and the history in the inspector

### Testing Deep Links

1. Navigate to the Navigation page
2. Enter deep link: `myapp://product/123?source=notification`
3. Click "Open Deep Link"
4. Verify the app opens the correct screen with params

### Debugging Navigation Issues

1. Monitor the navigation history for unexpected route changes
2. Check current route params to verify data is passed correctly
3. Use the full navigation state viewer to inspect the complete navigation tree
4. Test back navigation to ensure proper stack management
