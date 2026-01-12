import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import axios from 'axios'

// API Base URL (환경변수에서 가져오기)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000'

interface Account {
  account_id: number
  clerk_user_id: string
  email: string
  nickname: string
  profile_image_url: string | null
  last_login_at: string | null
  created_at: string | null
  updated_at: string | null
  is_deleted: boolean
}

interface TableInfo {
  table_name: string
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
}

export default function DbViewerScreen() {
  const router = useRouter()
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
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
      setError(axiosError.response?.data?.detail?.message || axiosError.message || '조회 실패')
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
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
      setError(axiosError.response?.data?.detail?.message || axiosError.message || '조회 실패')
      setTableData(null)
    } finally {
      setLoading(false)
    }
  }

  // 계정 삭제
  const deleteAccount = async (accountId: number) => {
    Alert.alert(
      '삭제 확인',
      '정말 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_BASE_URL}/api/v1/admin/accounts/${accountId}`)
              fetchAccounts()
            } catch (err: unknown) {
              const axiosError = err as { response?: { data?: { detail?: { message?: string } } }; message?: string }
              Alert.alert('삭제 실패', axiosError.response?.data?.detail?.message || '삭제에 실패했습니다.')
            }
          },
        },
      ]
    )
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
    <ScrollView className="flex-1 bg-white">
      <View className="p-4">
        <Text className="text-2xl font-bold mb-2">🗄️ DB 뷰어</Text>
        <Text className="text-gray-600 mb-6">데이터베이스 조회 및 관리</Text>

        {/* 탭 네비게이션 */}
        <View className="flex-row mb-4 border-b border-gray-200">
          <TouchableOpacity
            className={`flex-1 py-3 ${activeTab === 'accounts' ? 'border-b-2 border-blue-500' : ''}`}
            onPress={() => setActiveTab('accounts')}
          >
            <Text className={`text-center font-semibold ${activeTab === 'accounts' ? 'text-blue-500' : 'text-gray-500'}`}>
              👤 계정 목록
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 ${activeTab === 'tables' ? 'border-b-2 border-blue-500' : ''}`}
            onPress={() => setActiveTab('tables')}
          >
            <Text className={`text-center font-semibold ${activeTab === 'tables' ? 'text-blue-500' : 'text-gray-500'}`}>
              📊 테이블 조회
            </Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View className="bg-red-50 p-4 rounded-lg mb-4">
            <Text className="text-red-800">❌ {error}</Text>
          </View>
        )}

        {activeTab === 'accounts' && (
          <View>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-semibold">계정 목록 ({accounts.length}명)</Text>
              <TouchableOpacity
                className="bg-blue-500 px-4 py-2 rounded-lg"
                onPress={fetchAccounts}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">🔄 새로고침</Text>
                )}
              </TouchableOpacity>
            </View>

            {accounts.length === 0 ? (
              <Text className="text-gray-500 text-center py-8">등록된 계정이 없습니다.</Text>
            ) : (
              <View className="border border-gray-200 rounded-lg">
                {accounts.map((acc) => (
                  <View key={acc.account_id} className="p-4 border-b border-gray-100">
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1">
                        <Text className="font-semibold">{acc.nickname}</Text>
                        <Text className="text-sm text-gray-600">{acc.email}</Text>
                        <Text className="text-xs text-gray-400 mt-1">
                          Clerk ID: {acc.clerk_user_id.substring(0, 15)}...
                        </Text>
                        <Text className="text-xs text-gray-400">
                          마지막 로그인: {formatDate(acc.last_login_at)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        className="bg-red-500 px-3 py-1 rounded"
                        onPress={() => deleteAccount(acc.account_id)}
                      >
                        <Text className="text-white text-xs">🗑️ 삭제</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'tables' && (
          <View>
            <View className="mb-4">
              <Text className="text-lg font-semibold mb-2">테이블 조회</Text>
              {/* React Native에서는 Picker를 사용해야 하지만, 간단히 첫 번째 테이블만 표시 */}
              {tableData && (
                <Text className="text-sm text-gray-600 mb-2">
                  테이블: <Text className="font-semibold">{tableData.table_name}</Text> | 총 {tableData.total}개 레코드
                </Text>
              )}
            </View>

            {loading ? (
              <ActivityIndicator size="large" className="py-8" />
            ) : tableData && tableData.rows.length > 0 ? (
              <View className="border border-gray-200 rounded-lg">
                {tableData.rows.slice(0, 10).map((row, idx) => (
                  <View key={idx} className="p-3 border-b border-gray-100">
                    {tableData.columns.map((col) => (
                      <View key={col} className="mb-2">
                        <Text className="text-xs font-semibold text-gray-500">{col}:</Text>
                        <Text className="text-sm">
                          {row[col] === null ? (
                            <Text className="text-gray-400">NULL</Text>
                          ) : typeof row[col] === 'boolean' ? (
                            row[col] ? '✅' : '❌'
                          ) : (
                            String(row[col]).substring(0, 50)
                          )}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
                {tableData.rows.length > 10 && (
                  <Text className="text-center text-gray-500 py-2">
                    ... 외 {tableData.rows.length - 10}개 레코드
                  </Text>
                )}
              </View>
            ) : (
              <Text className="text-gray-500 text-center py-8">데이터가 없습니다.</Text>
            )}
          </View>
        )}

        <View className="mt-6 flex-row justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-blue-500">← 메인으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}
