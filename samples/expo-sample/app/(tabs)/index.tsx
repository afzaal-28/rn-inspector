import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { addNote, decrement, increment, reset } from '../../store';
import type { RootState } from '../../store';

export default function HomeScreen() {
  const dispatch = useDispatch();
  const counter = useSelector((state: RootState) => state.demo.value);
  const notes = useSelector((state: RootState) => state.demo.notes);

  const [storedMessage, setStoredMessage] = useState<string>('');
  const [input, setInput] = useState('Hello from AsyncStorage');

  useEffect(() => {
    // Seed AsyncStorage once and read it back
    const seed = async () => {
      await AsyncStorage.setItem('rn-inspector-demo', input);
      const value = await AsyncStorage.getItem('rn-inspector-demo');
      setStoredMessage(value || '');
    };
    seed().catch(console.warn);
  }, []);

  const writeStorage = async () => {
    await AsyncStorage.setItem('rn-inspector-demo', input);
    const value = await AsyncStorage.getItem('rn-inspector-demo');
    setStoredMessage(value || '');
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">rn-inspector demo</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Redux counter</ThemedText>
        <ThemedText>Value: {counter}</ThemedText>
        <ThemedView style={styles.row}>
          <Pressable style={styles.button} onPress={() => dispatch(decrement())}>
            <ThemedText>-1</ThemedText>
          </Pressable>
          <Pressable style={styles.button} onPress={() => dispatch(increment())}>
            <ThemedText>+1</ThemedText>
          </Pressable>
          <Pressable style={styles.button} onPress={() => dispatch(reset())}>
            <ThemedText>Reset</ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedText type="subtitle" style={styles.topGap}>Notes</ThemedText>
        <ThemedText>{notes.join(', ')}</ThemedText>
        <Pressable
          style={[styles.button, styles.fullButton]}
          onPress={() => dispatch(addNote(`Note ${notes.length + 1}`))}>
          <ThemedText>Add note</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">AsyncStorage</ThemedText>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Enter a message"
          style={styles.input}
        />
        <ThemedView style={styles.row}>
          <Pressable style={styles.button} onPress={writeStorage}>
            <ThemedText>Save</ThemedText>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={async () => {
              const value = await AsyncStorage.getItem('rn-inspector-demo');
              setStoredMessage(value || '');
            }}>
            <ThemedText>Reload</ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedText style={styles.topGap}>Stored value:</ThemedText>
        <ThemedText>{storedMessage || '(empty)'}</ThemedText>
        <ThemedText style={styles.topGap}>
          Dev shortcuts: {Platform.select({ ios: 'cmd+d', android: 'cmd+m', web: 'F12' })}
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  card: {
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  fullButton: {
    alignItems: 'center',
  },
  topGap: {
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    padding: 10,
    backgroundColor: 'white',
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
