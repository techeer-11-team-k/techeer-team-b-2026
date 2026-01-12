"use client";

import { Todo } from "@/types/todo";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
        todo.completed && "opacity-60"
      )}
    >
      <Checkbox
        checked={todo.completed}
        onCheckedChange={() => onToggle(todo.id)}
        className="flex-shrink-0"
      />
      <p
        className={cn(
          "flex-1 text-sm font-medium",
          todo.completed && "line-through text-muted-foreground"
        )}
      >
        {todo.text}
      </p>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(todo.id)}
        className="flex-shrink-0 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
