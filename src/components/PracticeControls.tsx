import { useId } from 'react';
import { DIFFICULTIES, type Difficulty, type PracticeMode, type Taxonomy } from '../domain/types';
import { MODE_INFO } from './modes';


const DIFFICULTY_LABEL: Record<Difficulty, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

interface Props {
  taxonomy: Taxonomy;
  mode: PracticeMode;
  categoryId: string | null;
  subcategoryId: string | null;
  difficulty: Difficulty | null;
  disabled: boolean;
  onModeChange(mode: PracticeMode): void;
  onCategoryChange(categoryId: string | null): void;
  onSubcategoryChange(subcategoryId: string | null): void;
  onDifficultyChange(difficulty: Difficulty | null): void;
  onGenerate(): void;
  generateLabel: string;
}

export function PracticeControls(p: Props) {
  const id = useId();
  const category = p.taxonomy.categories.find((c) => c.id === p.categoryId);
  return (
    <section className="controls" aria-label="Practice setup">
      <div className="mode-switch" role="radiogroup" aria-label="Practice mode">
        {(Object.keys(MODE_INFO) as PracticeMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={p.mode === m}
            className="mode-option"
            disabled={p.disabled}
            onClick={() => p.onModeChange(m)}
            onKeyDown={(e) => {
              const modes = Object.keys(MODE_INFO) as PracticeMode[];
              const i = modes.indexOf(m);
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = modes[(i + (e.key === 'ArrowRight' ? 1 : modes.length - 1)) % modes.length]!;
                p.onModeChange(next);
                (e.currentTarget.parentElement?.children[modes.indexOf(next)] as HTMLElement | undefined)?.focus();
              }
            }}
            tabIndex={p.mode === m ? 0 : -1}
          >
            {MODE_INFO[m].label}
          </button>
        ))}
      </div>
      <p className="mode-blurb">{MODE_INFO[p.mode].blurb}</p>

      <div className="filters">
        <label className="field" htmlFor={`${id}-cat`}>
          <span>Category</span>
          <select
            id={`${id}-cat`}
            value={p.categoryId ?? ''}
            disabled={p.disabled}
            onChange={(e) => p.onCategoryChange(e.target.value || null)}
          >
            <option value="">All topics</option>
            {p.taxonomy.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor={`${id}-sub`}>
          <span>Subcategory</span>
          <select
            id={`${id}-sub`}
            value={p.subcategoryId ?? ''}
            disabled={p.disabled || !category}
            onChange={(e) => p.onSubcategoryChange(e.target.value || null)}
          >
            <option value="">{category ? `All of ${category.label}` : 'Choose a category first'}</option>
            {category?.subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor={`${id}-diff`}>
          <span>Difficulty</span>
          <select
            id={`${id}-diff`}
            value={p.difficulty ?? ''}
            disabled={p.disabled}
            onChange={(e) => p.onDifficultyChange((e.target.value || null) as Difficulty | null)}
          >
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button primary generate" disabled={p.disabled} onClick={p.onGenerate}>
          {p.generateLabel}
        </button>
      </div>
    </section>
  );
}
