import './OverviewCellNote.css';
import { EXPORT_SHELL } from '../../utils/overviewExportTokens';

interface OverviewCellNoteProps {
  text: string;
  exportMode?: boolean;
}

export function OverviewCellNote({ text, exportMode }: OverviewCellNoteProps) {
  return (
    <div
      className="overview-cell-note"
      title={text}
      style={
        exportMode
          ? {
              background: EXPORT_SHELL.cellNoteBg,
              borderColor: EXPORT_SHELL.border,
            }
          : undefined
      }
    >
      <span className="overview-cell-note__icon">ⓘ</span>
      <span className="overview-cell-note__text">{text}</span>
    </div>
  );
}
