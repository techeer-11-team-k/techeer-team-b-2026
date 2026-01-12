"use client";

import { useState, useEffect } from "react";
import { Todo } from "@/types/todo";
import { TodoForm } from "@/components/todo-form";
import { TodoItem } from "@/components/todo-item";
import {
  getTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
} from "@/lib/todo-api";

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 컴포넌트 마운트 시 Supabase에서 할 일 목록 불러오기
  useEffect(() => {
    loadTodos();
  }, []);

  // 할 일 목록 불러오기
  const loadTodos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTodos();
      setTodos(data);
    } catch (err) {
      setError("할 일 목록을 불러오는 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 할 일 추가 핸들러
  const handleAdd = async (text: string) => {
    const newTodo = await addTodo(text);
    if (newTodo) {
      await loadTodos();
    } else {
      setError("할 일을 추가하는 중 오류가 발생했습니다.");
    }
  };

  // 할 일 완료 상태 토글 핸들러
  const handleToggle = async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      const success = await toggleTodo(id, todo.completed);
      if (success) {
        await loadTodos();
      } else {
        setError("할 일을 수정하는 중 오류가 발생했습니다.");
      }
    }
  };

  // 할 일 삭제 핸들러
  const handleDelete = async (id: string) => {
    if (confirm("정말 이 할 일을 삭제하시겠습니까?")) {
      const success = await deleteTodo(id);
      if (success) {
        await loadTodos();
      } else {
        setError("할 일을 삭제하는 중 오류가 발생했습니다.");
      }
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-center mb-2">Todo App</h1>
          <p className="text-center text-muted-foreground">
            할 일을 관리하고 완료해보세요
          </p>
        </header>

        {/* 할 일 추가 폼 */}
        <div className="mb-6">
          <TodoForm onAdd={handleAdd} />
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 p-4 rounded-lg border border-destructive bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* 할 일 목록 */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>할 일 목록을 불러오는 중...</p>
            </div>
          ) : todos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>아직 할 일이 없습니다.</p>
              <p className="text-sm mt-2">위에서 새로운 할 일을 추가해보세요!</p>
            </div>
          ) : (
            todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        {/* 통계 정보 */}
        {todos.length > 0 && (
          <div className="mt-8 p-4 rounded-lg border bg-muted/50 text-center">
            <p className="text-sm font-medium">
              전체: <span className="text-foreground">{todos.length}개</span> / 
              완료: <span className="text-primary">{todos.filter((t) => t.completed).length}개</span> / 
              남은 일: <span className="text-foreground">{todos.filter((t) => !t.completed).length}개</span>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
