import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET: 할 일 목록 조회
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("할 일 목록 조회 오류:", error);
      return NextResponse.json(
        { error: "할 일 목록을 불러오는 중 오류가 발생했습니다." },
        { status: 500 }
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

// POST: 새로운 할 일 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "할 일 내용을 입력해주세요." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("todos")
      .insert({
        text: text.trim(),
        completed: false,
      })
      .select()
      .single();

    if (error) {
      console.error("할 일 추가 오류:", error);
      return NextResponse.json(
        { error: "할 일을 추가하는 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("서버 오류:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
