import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { useEditor } from '../store/editorStore';
import type { LogoSize } from '../brand/brand';
import type { LogoEl } from '../types';
import styles from './StepPanel.module.css';

export const LogoStep: React.FC = () => {
  const addLogo = useEditor((s) => s.addLogo);
  const setLogoSize = useEditor((s) => s.setLogoSize);
  const placeLogo = useEditor((s) => s.placeLogo);
  const removeElement = useEditor((s) => s.removeElement);
  const logo = useEditor((s) => s.doc.elements.find((e): e is LogoEl => e.kind === 'logo') ?? null);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>4. Carimba a logo 🏷️</h2>
        <p className={styles.description}>
          Esta etapa é opcional. Se desejar, insira a assinatura oficial da Cuscuz Records.
        </p>
      </div>

      {!logo ? (
        <Card title="Adicionar Logo" subtitle="Escolha a versão desejada">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => addLogo('paper')}
            >
              Adicionar Logo com Papel
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => addLogo('clean')}
            >
              Adicionar Logo Sem Fundo
            </Button>
          </div>
        </Card>
      ) : (
        <Card
          title="Opções da Logo"
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={16} strokeWidth={2.5} />}
              onClick={() => removeElement(logo.id)}
            >
              Remover
            </Button>
          }
        >
          {/* Alternar Versão */}
          <div className={styles.section}>
            <span style={{ fontSize: '15px', fontWeight: 700 }}>Versão</span>
            <Segmented
              options={[
                { value: 'paper', label: 'Com Papel' },
                { value: 'clean', label: 'Sem Fundo' },
              ]}
              value={logo.variant}
              onChange={(variant) => addLogo(variant)}
            />
          </div>

          {/* Tamanhos Rápidos P / M / G */}
          <div className={styles.section}>
            <span style={{ fontSize: '15px', fontWeight: 700 }}>Tamanho</span>
            <div className={styles.buttonGrid3}>
              {(['P', 'M', 'G'] as LogoSize[]).map((sz) => (
                <Button
                  key={sz}
                  variant="secondary"
                  size="sm"
                  onClick={() => setLogoSize(sz)}
                >
                  {sz}
                </Button>
              ))}
            </div>
          </div>

          {/* Posicionamento Rápido */}
          <div className={styles.section}>
            <span style={{ fontSize: '15px', fontWeight: 700 }}>Posições Rápidas</span>
            <div className={styles.buttonGrid}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => placeLogo('tl')}
              >
                Canto Sup. Esq.
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => placeLogo('tr')}
              >
                Canto Sup. Dir.
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => placeLogo('bl')}
              >
                Canto Inf. Esq.
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => placeLogo('br')}
              >
                Canto Inf. Dir.
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => placeLogo('bc')}
              >
                Centro Inferior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => placeLogo('center')}
              >
                Centro da Folha
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
