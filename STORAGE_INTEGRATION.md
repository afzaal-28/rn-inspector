# Storage Integration Guide

This guide explains how to properly integrate AsyncStorage and Redux inspection/mutation features in your React Native app.

## AsyncStorage Integration

### Step 1: Expose AsyncStorage Globally

In your app's entry point (e.g., `App.tsx` or `index.js`):

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expose AsyncStorage for rn-inspector
global.__RN_INSPECTOR_ASYNC_STORAGE__ = AsyncStorage;
```

### How It Works

- **Read**: The inspector fetches all keys using `getAllKeys()` and retrieves values with `multiGet()`
- **Create/Update**: Values are set using `setItem()` with JSON serialization
- **Delete**: Keys are removed using `removeItem()` for root-level deletions

### Path Format

AsyncStorage paths use dot notation:
- `userSettings` - Root key
- `userSettings.theme` - Nested property
- `userSettings.preferences.notifications` - Deep nested property
- `userSettings.items[0]` - Array element (converted to `userSettings.items.0`)

## Redux Integration

### Step 1: Expose Redux Store Globally

In your Redux store configuration file:

```typescript
import { configureStore } from '@reduxjs/toolkit';

const store = configureStore({
  reducer: rootReducer,
  // ... other config
});

// Expose store for rn-inspector
global.__RN_INSPECTOR_REDUX_STORE__ = store;

export default store;
```

### Step 2: Handle State Replacement in Reducer

**CRITICAL**: Your root reducer MUST handle the `__RN_INSPECTOR_REDUX_SET_STATE__` action to allow state mutations.

#### Option A: Redux Toolkit (Recommended)

```typescript
import { configureStore, createSlice } from '@reduxjs/toolkit';

// Your slices...
const userSlice = createSlice({
  name: 'user',
  initialState: { name: '', email: '' },
  reducers: {
    setUser: (state, action) => action.payload,
  },
});

// Root reducer with inspector support
const rootReducer = (state, action) => {
  // Handle inspector state replacement
  if (action.type === '__RN_INSPECTOR_REDUX_SET_STATE__') {
    return action.payload;
  }
  
  // Normal reducer logic
  return combineReducers({
    user: userSlice.reducer,
    // ... other slices
  })(state, action);
};

const store = configureStore({
  reducer: rootReducer,
});

global.__RN_INSPECTOR_REDUX_STORE__ = store;
```

#### Option B: Classic Redux

```typescript
import { createStore, combineReducers } from 'redux';

const rootReducer = (state, action) => {
  // Handle inspector state replacement
  if (action.type === '__RN_INSPECTOR_REDUX_SET_STATE__') {
    return action.payload;
  }
  
  // Normal combined reducers
  return combineReducers({
    user: userReducer,
    settings: settingsReducer,
    // ... other reducers
  })(state, action);
};

const store = createStore(rootReducer);
global.__RN_INSPECTOR_REDUX_STORE__ = store;
```

#### Option 3: Redux DevTools Extension (Alternative)

If you're already using Redux DevTools Extension:

```typescript
import { configureStore } from '@reduxjs/toolkit';

const store = configureStore({
  reducer: rootReducer,
  devTools: true,
});

// The inspector will automatically detect the store from Redux DevTools
if (window.__REDUX_DEVTOOLS_EXTENSION__) {
  window.__REDUX_DEVTOOLS_EXTENSION__.store = store;
}
```

### How It Works

- **Read**: The inspector calls `store.getState()` to retrieve the current state
- **Create/Update**: Dispatches `__RN_INSPECTOR_REDUX_SET_STATE__` action with modified state
- **Delete**: Dispatches `__RN_INSPECTOR_REDUX_SET_STATE__` action with property removed from state

### Path Format

Redux paths use dot notation:
- `user` - Root-level state slice
- `user.name` - Property in user slice
- `settings.theme.colors.primary` - Deep nested property
- `items[0]` - Array element (converted to `items.0`)

## Common Issues & Solutions

### AsyncStorage Not Available

**Error**: `AsyncStorage not available`

**Solution**: Ensure you've installed and exposed AsyncStorage:
```bash
npm install @react-native-async-storage/async-storage
# or
yarn add @react-native-async-storage/async-storage
```

Then expose it globally as shown above.

### Redux Store Not Found

**Error**: `Redux store not found or invalid`

**Solution**: Make sure you've exposed the store globally:
```typescript
global.__RN_INSPECTOR_REDUX_STORE__ = store;
```

### Redux Dispatch Failed

**Error**: `Redux dispatch failed: ... Ensure your reducer handles __RN_INSPECTOR_REDUX_SET_STATE__`

**Solution**: Your root reducer must handle the inspector action. See "Step 2: Handle State Replacement in Reducer" above.

### Path Not Found

**Error**: `Path not found for deletion` or `Path not found in Redux state`

**Solution**: Verify the path exists. Use the UI to inspect the current structure before attempting mutations.

### Cannot Delete Entire Redux State

**Error**: `Cannot delete entire Redux state`

**Solution**: You cannot delete the root Redux state. Only delete specific slices or properties.

## Best Practices

1. **Development Only**: Only expose globals in development mode:
   ```typescript
   if (__DEV__) {
     global.__RN_INSPECTOR_ASYNC_STORAGE__ = AsyncStorage;
     global.__RN_INSPECTOR_REDUX_STORE__ = store;
   }
   ```

2. **Type Safety**: Add TypeScript declarations:
   ```typescript
   declare global {
     var __RN_INSPECTOR_ASYNC_STORAGE__: typeof AsyncStorage;
     var __RN_INSPECTOR_REDUX_STORE__: ReturnType<typeof configureStore>;
   }
   ```

3. **Error Handling**: The inspector provides detailed error messages in the UI. Check the storage panel for specific error details.

4. **State Immutability**: Redux mutations create a new state object. Your reducers should remain pure.

5. **AsyncStorage Serialization**: Only JSON-serializable values are supported. Complex objects (Functions, Symbols, etc.) will be converted to strings.

## Example: Complete Integration

```typescript
// store/index.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import userSlice from './slices/userSlice';
import settingsSlice from './slices/settingsSlice';

// Root reducer with inspector support
const appReducer = combineReducers({
  user: userSlice,
  settings: settingsSlice,
});

const rootReducer = (state, action) => {
  if (action.type === '__RN_INSPECTOR_REDUX_SET_STATE__') {
    return action.payload;
  }
  return appReducer(state, action);
};

const store = configureStore({
  reducer: rootReducer,
});

// Expose for rn-inspector (development only)
if (__DEV__) {
  global.__RN_INSPECTOR_ASYNC_STORAGE__ = AsyncStorage;
  global.__RN_INSPECTOR_REDUX_STORE__ = store;
}

export default store;
```

## Testing Your Integration

1. Start your React Native app
2. Run `npx rn-inspector`
3. Open the inspector UI
4. Navigate to the Storage page
5. Click "Refresh" to fetch storage data
6. Verify both AsyncStorage and Redux data appear
7. Try editing a value and verify it updates in your app
8. Check for any error messages in the UI

## Support

If you encounter issues:
1. Check the error message in the Storage page
2. Verify your integration matches this guide
3. Ensure your app is in development mode
4. Check the CLI console for additional error details
