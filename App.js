import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import appCheck from '@react-native-firebase/app-check';

const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
rnfbProvider.configure({
  android: {
    provider: 'debug',
    debugToken: '6022EF1D-C3FE-4CD1-8A7E-1FC5B4AB5209',
  },
});
appCheck().initializeAppCheck({ provider: rnfbProvider, isTokenAutoRefreshEnabled: true });

export default function App() {
  const [reclutador, setReclutador] = useState(null);

  useEffect(() => {
    appCheck().getToken(true).catch(e => console.log('AppCheck error:', e.message));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!reclutador ? (
        <LoginScreen onLogin={setReclutador} />
      ) : (
        <HomeScreen reclutador={reclutador} onLogout={() => setReclutador(null)} />
      )}
    </SafeAreaProvider>
  );
}