import { useState, useCallback, useEffect, CSSProperties } from 'react';

interface Column { name: string; type: string; }
interface QuestDBSuccessfulResponse {query: string; columns?: Column[]; dataset?: any[][]; count?: number; ddl?: boolean; error?: undefined; }
interface QuestDBErrorResponse {query: string; error: string; position?: number; ddl?: undefined; dataset?: undefined; columns?: undefined; }
type QuestDBResponse = QuestDBSuccessfulResponse | QuestDBErrorResponse;

const QUESTDB_DEMO_URL_EMBEDDED: string = 'https://demo.questdb.io';

interface QuestDbSqlRunnerEmbeddedProps {
  queryToExecute: string;
  questdbUrl?: string;
}

const embeddedResultStyles: { [key: string]: CSSProperties } = {
  error: {
    color: 'red', padding: '0.5rem', border: '1px solid red',
    borderRadius: '4px', backgroundColor: '#ffebee', whiteSpace: 'pre-wrap', marginBottom: '0.5rem',
  },
};


export function QuestDbSqlRunnerEmbedded({
                                           queryToExecute,
                                           questdbUrl = QUESTDB_DEMO_URL_EMBEDDED,
                                         }: QuestDbSqlRunnerEmbeddedProps): JSX.Element | null {
  const [columns, setColumns] = useState<Column[]>([]);
  const [dataset, setDataset] = useState<any[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [nonTabularResponse, setNonTabularResponse] = useState<string | null>(null);

  const executeQuery = useCallback(async () => {
    if (!queryToExecute || !queryToExecute.trim()) {
      setLoading(false); setError(null); setColumns([]); setDataset([]);
      setNonTabularResponse(null); setRowCount(null);
      return;
    }

    setLoading(true); setError(null); setColumns([]); setDataset([]);
    setNonTabularResponse(null); setRowCount(null);

    const encodedQuery = encodeURIComponent(queryToExecute);
    const url = `${questdbUrl}/exec?query=${encodedQuery}&count=true&timings=true&limit=20`;

    try {
      const response = await fetch(url);
      const responseBody = await response.text();

      if (!response.ok) {
        try {
          const errorJson = JSON.parse(responseBody) as { error?: string; position?: number };
          throw new Error(`QuestDB Error (HTTP ${response.status}): ${errorJson.error || responseBody} at position ${errorJson.position || 'N/A'}`);
        } catch (e: any) {
          if (e.message.startsWith('QuestDB Error')) throw e;
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}. Response: ${responseBody}`);
        }
      }
      const result = JSON.parse(responseBody) as QuestDBResponse;
      if (result.error) {
        setError(`Query Error: ${result.error}${result.position ? ` at position ${result.position}` : ''}`);
      } else if (result.dataset) {
        if (result.columns) setColumns(result.columns);
        else if (result.dataset.length > 0 && Array.isArray(result.dataset[0])) {
          setColumns(result.dataset[0].map((_, i) => ({ name: `col${i+1}`, type: 'UNKNOWN' })));
        }
        setDataset(result.dataset || []);
        setRowCount(result.count !== undefined ? result.count : (result.dataset?.length || 0));
      } else {
        setNonTabularResponse(`Query executed. Response: ${JSON.stringify(result)}`);
      }
    } catch (err: any) {
      console.error("Fetch or Parsing Error:", err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [queryToExecute, questdbUrl]);

  useEffect(() => {
    // Auto-execute when the component is rendered with a valid query, or when the query changes.
    if (queryToExecute && queryToExecute.trim()) {
      executeQuery();
    } else {
      // Clear results if the query becomes empty or invalid after being valid
      setError(null); setColumns([]); setDataset([]); setNonTabularResponse(null);
      setRowCount(null); setLoading(false);
    }
  }, [queryToExecute, executeQuery]); // executeQuery depends on questdbUrl

  // Render loading state, error, or results
  if (loading) {
    return <div><p>Executing query...</p></div>;
  }

  // If there's an error or any data to show, wrap it in the container
  // Only render the container if there's something to show (error, data, or non-tabular response)
  // or if it was loading (handled above).
  // If query was empty and nothing executed, this component will render null effectively.
  const hasContent = error || nonTabularResponse || (columns.length > 0 && dataset.length >= 0);

  if (!hasContent && !queryToExecute?.trim()) { // If query is empty and no prior error/data
    return null;
  }


  return (
    <div>
      {error && <div style={embeddedResultStyles.error}>Error: {error}</div>}
      {nonTabularResponse && !error && (
        <div>
          <p>Response:</p>
          <div>{nonTabularResponse}</div>
        </div>
      )}
      {columns && columns.length > 0 && dataset.length >= 0 && !nonTabularResponse && !error && (
        <div>
          {dataset.length === 0 && <p>Query executed successfully, but returned no rows.</p>}
          {dataset.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>{columns.map((col, i) => <th key={i}>{col.name} ({col.type})</th>)}</tr></thead>
                <tbody>
                {dataset.map((row, rI) => (
                  <tr key={rI}>{columns.map((_c, cI) => <td key={cI}>{row[cI] === null ? 'NULL' : typeof row[cI] === 'boolean' ? row[cI].toString() : String(row[cI])}</td>)}</tr>
                ))}
                </tbody>
              </table>
            </div>
          )}
          {rowCount !== null && <p>Total rows: {rowCount}</p>}
        </div>
      )}
    </div>
  );
}