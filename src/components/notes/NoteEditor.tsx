import { useState, type ReactNode } from "react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  SquareCode,
  Minus,
  Link2,
  Undo2,
  Redo2,
} from "lucide-react";

import { PromptDialog } from "@/components/PromptDialog";
import { cn } from "@/lib/utils";

/**
 * The note body: a WYSIWYG editor that speaks markdown. You type the way you would in Obsidian
 * or Notion — «# » becomes a heading, «- » a list, «[ ] » a checkbox, «**…**» bold, «> » a quote,
 * «```» a code block — and it formats in place. In and out it is plain markdown, so what is
 * stored stays readable anywhere.
 *
 * Mount it with `key={note.id}`: the initial content is read once, switching notes remounts.
 */
export function NoteEditor({
  initial,
  onChange,
  autoFocus,
}: {
  initial: string;
  onChange: (markdown: string) => void;
  autoFocus?: boolean;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? "Заголовок" : "Пишите… «# » — заголовок, «- » — список, «[ ] » — чекбокс",
      }),
      Markdown,
    ],
    content: initial,
    contentType: "markdown",
    autofocus: autoFocus ? "end" : false,
    editorProps: { attributes: { class: "note-prose", spellcheck: "true" } },
    onUpdate: ({ editor: e }) => onChange(e.getMarkdown()),
  });

  if (!editor) return null;

  function applyLink(url: string) {
    if (!editor) return;
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} onLink={() => setLinkOpen(true)} />
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: e, state }) => !state.selection.empty && !e.isActive("codeBlock")}
        className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-lg"
      >
        <InlineButtons editor={editor} onLink={() => setLinkOpen(true)} />
      </BubbleMenu>
      <div className="min-h-0 flex-1 cursor-text overflow-y-auto" onClick={(e) => e.target === e.currentTarget && editor.chain().focus("end").run()}>
        <EditorContent editor={editor} />
      </div>
      <PromptDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title="Ссылка"
        placeholder="https://…"
        defaultValue={editor.getAttributes("link").href ?? ""}
        confirmLabel="Вставить"
        onSubmit={applyLink}
      />
    </div>
  );
}

function ToolButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // Keep the selection: a mousedown on the button would otherwise blur the editor first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-30",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-4 w-px shrink-0 bg-border" />;

function useMarks(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
}

function InlineButtons({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const s = useMarks(editor);
  const c = () => editor.chain().focus();
  return (
    <>
      <ToolButton title="Жирный (Ctrl+B)" active={s.bold} onClick={() => c().toggleBold().run()}><Bold className="h-4 w-4" /></ToolButton>
      <ToolButton title="Курсив (Ctrl+I)" active={s.italic} onClick={() => c().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolButton>
      <ToolButton title="Зачёркнутый" active={s.strike} onClick={() => c().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolButton>
      <ToolButton title="Код (Ctrl+E)" active={s.code} onClick={() => c().toggleCode().run()}><Code className="h-4 w-4" /></ToolButton>
      <ToolButton
        title={s.link ? "Убрать ссылку" : "Ссылка"}
        active={s.link}
        onClick={() => (s.link ? c().extendMarkRange("link").unsetLink().run() : onLink())}
      >
        <Link2 className="h-4 w-4" />
      </ToolButton>
    </>
  );
}

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const s = useMarks(editor);
  const c = () => editor.chain().focus();
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-3 py-1.5 md:px-11 [scrollbar-width:none]">
      <ToolButton title="Заголовок 1" active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></ToolButton>
      <ToolButton title="Заголовок 2" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolButton>
      <ToolButton title="Заголовок 3" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></ToolButton>
      <Sep />
      <InlineButtons editor={editor} onLink={onLink} />
      <Sep />
      <ToolButton title="Список" active={s.bullet} onClick={() => c().toggleBulletList().run()}><List className="h-4 w-4" /></ToolButton>
      <ToolButton title="Нумерованный список" active={s.ordered} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolButton>
      <ToolButton title="Чек-лист" active={s.task} onClick={() => c().toggleTaskList().run()}><ListTodo className="h-4 w-4" /></ToolButton>
      <ToolButton title="Цитата" active={s.quote} onClick={() => c().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolButton>
      <ToolButton title="Блок кода" active={s.codeBlock} onClick={() => c().toggleCodeBlock().run()}><SquareCode className="h-4 w-4" /></ToolButton>
      <ToolButton title="Разделитель" onClick={() => c().setHorizontalRule().run()}><Minus className="h-4 w-4" /></ToolButton>
      <Sep />
      <ToolButton title="Отменить (Ctrl+Z)" disabled={!s.canUndo} onClick={() => c().undo().run()}><Undo2 className="h-4 w-4" /></ToolButton>
      <ToolButton title="Повторить (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => c().redo().run()}><Redo2 className="h-4 w-4" /></ToolButton>
    </div>
  );
}
