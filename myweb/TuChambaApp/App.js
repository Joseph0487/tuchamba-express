import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';

export default function App() {
  const [reclutador, setReclutador] = useState(null);

  if (!reclutador) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen onLogin={setReclutador} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <HomeScreen reclutador={reclutador} onLogout={() => setReclutador(null)} />
    </>
  );
}