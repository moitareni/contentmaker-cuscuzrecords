import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { collectGarbageImages, hydrateUserImages } from './lib/userImages';
import { useEditor } from './store/editorStore';
import './theme/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// As imagens da etapa 3 vivem no IndexedDB, fora do rascunho do localStorage.
// Hidrata o registry, reconcilia o doc (elimina imagens cujo blob sumiu), roda
// o GC de órfãos e limpa o histórico para o undo não ressuscitar o estado de boot.
const bootImageIds = new Set(
  useEditor
    .getState()
    .doc.elements.filter((e) => e.kind === 'image')
    .map((e) => e.imageId),
);
void hydrateUserImages().then((availableIds) => {
  const st = useEditor.getState();
  st.reconcileImages(new Set([...bootImageIds].filter((id) => availableIds.has(id))));
  void collectGarbageImages(
    new Set(st.doc.elements.filter((e) => e.kind === 'image').map((e) => e.imageId)),
  );
  useEditor.temporal.getState().clear();
});
