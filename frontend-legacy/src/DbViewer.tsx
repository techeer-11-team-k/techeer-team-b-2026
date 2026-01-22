import { useState, useEffect } from 'react'
import axios from 'axios'
import './DbViewer.css'

// ⚠️ 보안: API URL은 환경변수에서만 가져옵니다.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

if (!API_BASE_URL) {
  throw new Error(
    'VITE_API_BASE_URL이 설정되지 않았습니다.\n' +
    '프로젝트 루트의 .env 파일에 VITE_API_BASE_URL을 추가하세요.'
  )
}

interface Account {
  account_id: number
  clerk_user_id: string
  email: string
  created_at: string | null
  updated_at: string | null
  is_deleted: boolean
}

interface TableInfo {
  table_name: string
  columns: string[]
  rows: Record<string, any>[]
  total: number
}

function DbViewer() {
  const [tables, setTables] = useState<string[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('accounts')
  const [tableData, setTableData] = useState<TableInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'accounts' | 'tables'>('accounts')

  // 테이블 목록 가져오기
  const fetchTables = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/admin/db/tables`)
      setTables(response.data.data.tables)
    } catch (err: any) {
      console.error('테이블 목록 조회 실패:', err)
    }
  }

  // 계정 목록 가져오기
  const fetchAccounts = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/admin/accounts`)
      setAccounts(response.data.data.accounts)
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || err.message)
    } finally {
      setLoading(false)
    }
  }

  // 테이블 데이터 가져오기
  const fetchTableData = async (tableName: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/admin/db/query?table_name=${tableName}`)
      setTableData(response.data.data)
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || err.message)
      setTableData(null)
    } finally {
      setLoading(false)
    }
  }

  // 계정 삭제
  const deleteAccount = async (accountId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    
    try {
      await axios.delete(`${API_BASE_URL}/api/v1/admin/accounts/${accountId}`)
      fetchAccounts()
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || '삭제 실패')
    }
  }

  useEffect(() => {
    fetchTables()
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (selectedTable && activeTab === 'tables') {
      fetchTableData(selectedTable)
    }
  }, [selectedTable, activeTab])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('ko-KR')
  }

  return (
    <div className="db-viewer">
      <header className="db-header">
        <h1>🗄️ DB 뷰어</h1>
        <p>데이터베이스 조회 및 관리</p>
      </header>

      <nav className="db-tabs">
        <button 
          className={activeTab === 'accounts' ? 'active' : ''} 
          onClick={() => setActiveTab('accounts')}
        >
          👤 계정 목록
        </button>
        <button 
          className={activeTab === 'tables' ? 'active' : ''} 
          onClick={() => setActiveTab('tables')}
        >
          📊 테이블 조회
        </button>
      </nav>

      <main className="db-content">
        {activeTab === 'accounts' && (
          <section className="accounts-section">
            <div className="section-header">
              <h2>계정 목록 ({accounts.length}명)</h2>
              <button onClick={fetchAccounts} disabled={loading}>
                {loading ? '로딩 중...' : '🔄 새로고침'}
              </button>
            </div>

            {error && <div className="error-message">❌ {error}</div>}

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>이메일</th>
                    <th>Clerk ID</th>
                    <th>가입일</th>
                    <th>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty-row">
                        등록된 계정이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    accounts.map((acc) => (
                      <tr key={acc.account_id}>
                        <td>{acc.account_id}</td>
                        <td>{acc.email}</td>
                        <td className="clerk-id">{acc.clerk_user_id.substring(0, 15)}...</td>
                        <td>{formatDate(acc.created_at)}</td>
                        <td>
                          <button 
                            className="delete-btn"
                            onClick={() => deleteAccount(acc.account_id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'tables' && (
          <section className="tables-section">
            <div className="section-header">
              <h2>테이블 조회</h2>
              <select 
                value={selectedTable} 
                onChange={(e) => setSelectedTable(e.target.value)}
              >
                {tables.map((table) => (
                  <option key={table} value={table}>{table}</option>
                ))}
              </select>
            </div>

            {error && <div className="error-message">❌ {error}</div>}

            {tableData && (
              <div className="table-info">
                <p>테이블: <strong>{tableData.table_name}</strong> | 총 {tableData.total}개 레코드</p>
              </div>
            )}

            <div className="table-container">
              {loading ? (
                <div className="loading">로딩 중...</div>
              ) : tableData && tableData.rows.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      {tableData.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row, idx) => (
                      <tr key={idx}>
                        {tableData.columns.map((col) => (
                          <td key={col}>
                            {row[col] === null ? (
                              <span className="null-value">NULL</span>
                            ) : typeof row[col] === 'boolean' ? (
                              row[col] ? '✅' : '❌'
                            ) : (
                              String(row[col]).substring(0, 50)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-table">데이터가 없습니다.</div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="db-footer">
        <a href="/">← 메인으로 돌아가기</a>
        <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noopener">
          📚 API 문서
        </a>
      </footer>
    </div>
  )
}

export default DbViewer
