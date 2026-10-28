import type { ReactNode } from "react";

import styles from "./Detection.module.css";

export interface ReportColumn<Row> {
  header: string;
  cell: (row: Row, index: number) => ReactNode;
}

interface ReportTableProps<Row> {
  caption: string;
  columns: ReportColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string | number;
  /** Shown in a single row when there is nothing to list. */
  empty: string;
}

/** The original report table (No. / Objects / ...), shared by the detection pages. */
export function ReportTable<Row>({ caption, columns, rows, rowKey, empty }: ReportTableProps<Row>) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} scope="col" className={styles.th}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.td}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={rowKey(row, index)}>
                {columns.map((column) => (
                  <td key={column.header} className={styles.td}>
                    {column.cell(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
