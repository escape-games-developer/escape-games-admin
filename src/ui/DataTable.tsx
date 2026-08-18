import type { ReactNode } from "react";

export type DataTableColumn<Row> = {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
};

type Props<Row> = {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  pinnedRows?: Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  onRowClick?: (row: Row) => void;
  isRowClickable?: (row: Row) => boolean;
  rowClassName?: (row: Row) => string | undefined;
};

export default function DataTable<Row>({ columns, rows, pinnedRows = [], rowKey, empty, loading = false, loadingLabel = "Cargando…", onRowClick, isRowClickable, rowClassName }: Props<Row>) {
  const renderRow = (row: Row) => (
    <tr
      key={rowKey(row)}
      className={[onRowClick && (isRowClickable?.(row) ?? true) ? "is-clickable" : "", rowClassName?.(row) ?? ""].filter(Boolean).join(" ")}
      onClick={() => onRowClick?.(row)}
    >
      {columns.map((column) => <td key={column.key} className={column.className} style={{ textAlign: column.align }}>{column.render(row)}</td>)}
    </tr>
  );

  return (
    <div className="eg-table-wrap">
      <table className="eg-table">
        <thead><tr>{columns.map((column) => <th key={column.key} className={column.className} style={{ textAlign: column.align }}>{column.header}</th>)}</tr></thead>
        <tbody>
          {pinnedRows.map(renderRow)}
          {loading ? (
            <tr><td className="eg-table__state" colSpan={columns.length}>{loadingLabel}</td></tr>
          ) : rows.length === 0 ? (
            <tr><td className="eg-table__state" colSpan={columns.length}>{empty ?? "No hay resultados."}</td></tr>
          ) : rows.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}
