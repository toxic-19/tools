import React from 'react';
import { Theme, Layout, Style } from '../hooks/useTheme';
import {
  LayoutSidebarIcon,
  LayoutCenteredIcon,
  LayoutFullscreenIcon,
  SquareIcon,
  CircleIcon,
  LinesIcon,
} from './Icons';

interface SwitcherPopupProps {
  theme: Theme;
  layout: Layout;
  style: Style;
  onThemeChange: (theme: Theme) => void;
  onLayoutChange: (layout: Layout) => void;
  onStyleChange: (style: Style) => void;
  onClose: () => void;
}

const themes: { id: Theme; label: string; color: string }[] = [
  { id: 'blue', label: '默认蓝', color: '#4F7CF8' },
  { id: 'amber', label: '琥珀暖', color: '#D4A574' },
  { id: 'emerald', label: '翡翠绿', color: '#10B981' },
  { id: 'rose', label: '玫瑰金', color: '#E879A9' },
  { id: 'dark', label: '暗夜紫', color: '#A78BFA' },
];

const layouts: { id: Layout; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'sidebar', label: '侧边栏', Icon: LayoutSidebarIcon },
  { id: 'centered', label: '居中', Icon: LayoutCenteredIcon },
  { id: 'fullscreen', label: '全屏', Icon: LayoutFullscreenIcon },
];

const styles: { id: Style; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'default', label: '默认', Icon: SquareIcon },
  { id: 'glass', label: '玻璃', Icon: CircleIcon },
  { id: 'minimal', label: '极简', Icon: LinesIcon },
];

const SwitcherPopup: React.FC<SwitcherPopupProps> = ({
  theme,
  layout,
  style,
  onThemeChange,
  onLayoutChange,
  onStyleChange,
  onClose,
}) => {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[999]" onClick={onClose} />

      {/* Popup */}
      <div className="fixed top-16 right-4 w-80 p-5 rounded-xl z-[1000] animate-fade-in shadow-lg"
           style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}>
        {/* Theme Section */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: 'var(--text-muted)' }}>
            主题
          </div>
          <div className="flex flex-wrap gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => onThemeChange(t.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200"
                style={{
                  backgroundColor: theme === t.id ? 'var(--primary-bg)' : 'var(--gray-50)',
                  color: theme === t.id ? 'var(--primary)' : 'var(--text-secondary)',
                  borderColor: theme === t.id ? 'var(--primary)' : 'var(--border)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                }}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Layout Section */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: 'var(--text-muted)' }}>
            布局
          </div>
          <div className="flex flex-wrap gap-2">
            {layouts.map((l) => {
              const Icon = l.Icon;
              return (
                <button
                  key={l.id}
                  onClick={() => onLayoutChange(l.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200"
                  style={{
                    backgroundColor: layout === l.id ? 'var(--primary-bg)' : 'var(--gray-50)',
                    color: layout === l.id ? 'var(--primary)' : 'var(--text-secondary)',
                    borderColor: layout === l.id ? 'var(--primary)' : 'var(--border)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Style Section */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: 'var(--text-muted)' }}>
            风格
          </div>
          <div className="flex flex-wrap gap-2">
            {styles.map((s) => {
              const Icon = s.Icon;
              return (
                <button
                  key={s.id}
                  onClick={() => onStyleChange(s.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all duration-200"
                  style={{
                    backgroundColor: style === s.id ? 'var(--primary-bg)' : 'var(--gray-50)',
                    color: style === s.id ? 'var(--primary)' : 'var(--text-secondary)',
                    borderColor: style === s.id ? 'var(--primary)' : 'var(--border)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default SwitcherPopup;
