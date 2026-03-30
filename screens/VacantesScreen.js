import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import VacanteDetailScreen from './VacanteDetailScreen';

const ITEMS_PER_PAGE = 15;

export default function VacantesScreen({ reclutador }) {
  const [vacantes, setVacantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vacanteActiva, setVacanteActiva] = useState(null);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [municipioFiltro, setMunicipioFiltro] = useState('');
  const [page, setPage] = useState(1);
  const [showEstados, setShowEstados] = useState(false);
  const [showMunicipios, setShowMunicipios] = useState(false);

  useEffect(() => {
    const jobsRef = ref(db, 'jobs');
    const unsub = onValue(jobsRef, (snapshot) => {
      if (!snapshot.exists()) { setVacantes([]); setLoading(false); return; }
      const data = snapshot.val();
      const mias = Object.entries(data)
        .filter(([id, j]) => j.status === 'Vigente')
        .map(([id, j]) => ({ id, ...j }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setVacantes(mias);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const estados = useMemo(() => {
    const set = new Set(vacantes.map(v => v.state).filter(Boolean));
    return Array.from(set).sort();
  }, [vacantes]);

  const municipios = useMemo(() => {
    if (!estadoFiltro) return [];
    const set = new Set(vacantes.filter(v => v.state === estadoFiltro).map(v => v.city).filter(Boolean));
    return Array.from(set).sort();
  }, [vacantes, estadoFiltro]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return vacantes.filter(v => {
      const text = `${v.title} ${v.company} ${v.location} ${v.description}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const matchSearch = !search || text.includes(q);
      const matchEstado = !estadoFiltro || v.state === estadoFiltro;
      const matchMunicipio = !municipioFiltro || v.city === municipioFiltro;
      return matchSearch && matchEstado && matchMunicipio;
    });
  }, [vacantes, search, estadoFiltro, municipioFiltro]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  function resetFiltros() {
    setSearch('');
    setEstadoFiltro('');
    setMunicipioFiltro('');
    setPage(1);
  }

  if (vacanteActiva) {
    return <VacanteDetailScreen vacante={vacanteActiva} onBack={() => setVacanteActiva(null)} />;
  }

  if (loading) return <ActivityIndicator color="#0a66c2" style={{ marginTop: 40 }} />;

  return (
    <View style={styles.container}>
      {/* Buscador */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Buscar vacante, empresa..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={t => { setSearch(t); setPage(1); }}
        />
      </View>

      {/* Filtros */}
      <View style={styles.filtros}>
        <TouchableOpacity style={styles.filtroBtn} onPress={() => { setShowEstados(!showEstados); setShowMunicipios(false); }}>
          <Text style={styles.filtroBtnText} numberOfLines={1}>{estadoFiltro || '📍 Estado'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filtroBtn, !estadoFiltro && styles.filtroBtnDisabled]}
          onPress={() => { if (estadoFiltro) { setShowMunicipios(!showMunicipios); setShowEstados(false); } }}>
          <Text style={styles.filtroBtnText} numberOfLines={1}>{municipioFiltro || '🏙️ Municipio'}</Text>
        </TouchableOpacity>
        {(estadoFiltro || municipioFiltro || search) && (
          <TouchableOpacity style={styles.clearBtn} onPress={resetFiltros}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Dropdown Estados */}
      {showEstados && (
        <View style={styles.dropdown}>
          <FlatList
            data={estados}
            keyExtractor={i => i}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.dropdownItem} onPress={() => {
                setEstadoFiltro(item);
                setMunicipioFiltro('');
                setShowEstados(false);
                setPage(1);
              }}>
                <Text style={styles.dropdownText}>{item}</Text>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 200 }}
          />
        </View>
      )}

      {/* Dropdown Municipios */}
      {showMunicipios && (
        <View style={styles.dropdown}>
          <FlatList
            data={municipios}
            keyExtractor={i => i}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.dropdownItem} onPress={() => {
                setMunicipioFiltro(item);
                setShowMunicipios(false);
                setPage(1);
              }}>
                <Text style={styles.dropdownText}>{item}</Text>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 200 }}
          />
        </View>
      )}

      {/* Contador */}
      <Text style={styles.counter}>{filtered.length} vacantes • Página {page} de {totalPages || 1}</Text>

      {/* Lista */}
      {paginated.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Sin resultados</Text>
        </View>
      ) : (
        <FlatList
          data={paginated}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setVacanteActiva(item)}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.company}>{item.company}</Text>
              {item.location && <Text style={styles.detail}>📍 {item.location}</Text>}
              {item.salary && <Text style={styles.detail}>💰 {item.salary}</Text>}
              {item.schedule && <Text style={styles.detail}>🕐 {item.schedule}</Text>}
              <Text style={styles.verMas}>Ver detalle →</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
        />
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
            onPress={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}>
            <Text style={styles.pageBtnText}>← Anterior</Text>
          </TouchableOpacity>
          <Text style={styles.pageInfo}>{page} / {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
            onPress={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}>
            <Text style={styles.pageBtnText}>Siguiente →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  searchContainer: { padding: 12, paddingBottom: 6 },
  searchInput: { backgroundColor: '#1e293b', color: '#fff', borderRadius: 10, padding: 12, fontSize: 14 },
  filtros: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 4, alignItems: 'center' },
  filtroBtn: { flex: 1, backgroundColor: '#1e293b', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#334155' },
  filtroBtnDisabled: { opacity: 0.4 },
  filtroBtnText: { color: '#94a3b8', fontSize: 12 },
  clearBtn: { backgroundColor: '#334155', borderRadius: 8, padding: 10, paddingHorizontal: 14 },
  clearBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  dropdown: { marginHorizontal: 12, backgroundColor: '#1e293b', borderRadius: 10, borderWidth: 1, borderColor: '#334155', zIndex: 10 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  dropdownText: { color: '#fff', fontSize: 13 },
  counter: { color: '#64748b', fontSize: 11, paddingHorizontal: 14, paddingVertical: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 15 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 10 },
  title: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  company: { color: '#0a66c2', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  detail: { color: '#94a3b8', fontSize: 13, marginBottom: 3 },
  verMas: { color: '#0a66c2', fontSize: 12, fontWeight: '600', marginTop: 8, textAlign: 'right' },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#1e293b' },
  pageBtn: { backgroundColor: '#0a66c2', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  pageBtnDisabled: { backgroundColor: '#334155' },
  pageBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pageInfo: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});