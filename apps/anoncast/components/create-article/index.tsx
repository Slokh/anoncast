'use client'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { useCreateArticle } from './context'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { CredentialsSelect } from '../credentials-select'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

export function CreateArticle() {
  const {
    title,
    setTitle,
    content,
    setContent,
    credential,
    publishArticle,
    isPending,
    wordCount,
    characterCount,
  } = useCreateArticle()

  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <Credential />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Article title..."
        className="p-3 font-semibold text-lg bg-zinc-950 border border-zinc-700"
      />
      <div className="flex justify-between items-center">
        <p className="font-medium text-zinc-400 text-sm">
          {wordCount} words · {characterCount.toLocaleString()} characters
        </p>
        <div className="flex gap-2">
          <Button
            variant={!showPreview ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowPreview(false)}
          >
            Write
          </Button>
          <Button
            variant={showPreview ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowPreview(true)}
          >
            Preview
          </Button>
        </div>
      </div>
      {!showPreview ? (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="h-[600px] p-4 resize-none font-mono text-sm placeholder:text-zinc-400 bg-zinc-950 border border-zinc-700"
          placeholder="Write your article in markdown...

## Heading 2
### Heading 3

**Bold text** and *italic text*

- List item 1
- List item 2

[Link text](https://example.com)

> Blockquote

\`\`\`
Code block
\`\`\`"
        />
      ) : (
        <div className="min-h-[600px] p-6 bg-zinc-950 border border-zinc-700 overflow-auto prose prose-invert max-w-none">
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {content}
            </ReactMarkdown>
          ) : (
            <p className="text-zinc-500">Preview will appear here...</p>
          )}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-end gap-4">
        <Button
          onClick={publishArticle}
          className="font-bold text-md rounded-md hover:scale-105 transition-all duration-300"
          disabled={isPending || !credential || !title.trim() || !content.trim()}
        >
          {isPending ? (
            <div className="flex flex-row items-center gap-2">
              <Loader2 className="animate-spin" />
              <p>Generating proof</p>
            </div>
          ) : (
            'Publish anonymously'
          )}
        </Button>
      </div>
    </div>
  )
}

function Credential() {
  const { credential, setCredential } = useCreateArticle()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-sm font-semibold">
          Post Credential <span className="text-red-500">*</span>
        </span>
        <span className="text-sm text-zinc-400">
          @anoncast requires a verified credential for at least 5,000 $ANON.
        </span>
      </div>
      <CredentialsSelect selected={credential} onSelect={setCredential} />
    </div>
  )
}
