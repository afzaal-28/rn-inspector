import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CounterState = {
  value: number;
  notes: string[];
};

const initialState: CounterState = {
  value: 1,
  notes: ['Initial note'],
};

const counterSlice = createSlice({
  name: 'demo',
  initialState,
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
    decrement: (state) => {
      state.value -= 1;
    },
    addNote: (state, action: PayloadAction<string>) => {
      state.notes.push(action.payload);
    },
    reset: () => initialState,
  },
});

export const { increment, decrement, addNote, reset } = counterSlice.actions;

const rootReducer = (state: any, action: any) => {
  if (action.type === '__RN_INSPECTOR_REDUX_SET_STATE__') {
    return action.payload;
  }
  return {
    demo: counterSlice.reducer(state?.demo, action),
  };
};

export const store = configureStore({
  reducer: rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Expose globals for rn-inspector
(global as any).__RN_INSPECTOR_REDUX_STORE__ = store;
(global as any).__RN_INSPECTOR_ASYNC_STORAGE__ = AsyncStorage;
