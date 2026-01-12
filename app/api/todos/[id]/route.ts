import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// PATCH: 할 일 수정 (완료 상태 토글 또는 텍스트 수정)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { completed, text } = body;

    const supabase = createSupabaseServerClient();

    const updateData: { completed?: boolean; text?: string } = {};
    if (typeof completed === "boolean") {
      updateData.completed = completed;
    }
    if (typeof text === "string" && text.trim().length > 0) {
      updateData.text = text.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "수정할 데이터가 없습니다." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("todos")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("할 일 수정 오류:", error);
      return NextResponse.json(
        { error: "할 일을 수정하는 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "할 일을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("서버 오류:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 할 일 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const supabase = createSupabaseServerClient();

    const { error } = await supabase.from("todos").delete().eq("id", id);

    if (error) {
      console.error("할 일 삭제 오류:", error);
      return NextResponse.json(
        { error: "할 일을 삭제하는 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("서버 오류:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
