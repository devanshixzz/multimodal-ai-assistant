# Multi-Modal AI Assistant

A production-ready AI assistant that can **see, read, watch, and understand** multiple types of media including images, videos, audio, and documents.

The application provides a unified conversational interface where users can upload media, ask questions about their content, generate AI-powered analysis, and compare multiple media files.

---

## 🚀 Live Demo

**Deployed Application:**  
http://116.202.210.102:20372/

**Backend API:**  
http://116.202.210.102:20370/api/

---

## ✨ Features

### 🖼️ Image Understanding

- Upload images using drag-and-drop or file picker
- Image preview before analysis
- AI-powered visual question answering
- Ask natural-language questions about uploaded images
- Support for multiple images
- Compare multiple images using AI
- Image thumbnails in the media gallery

### 🎥 Video Understanding

- Upload video files
- Validate uploaded video files
- Extract frames using FFmpeg
- Fixed-interval frame extraction
- Analyze extracted frames using a vision-capable LLM
- Generate AI-powered video summaries
- Display extracted frames and analysis results
- Video preview with playback controls

### 🎙️ Audio Understanding

- Upload audio files
- Audio format validation
- Speech-to-text transcription using Whisper
- AI-powered transcript analysis
- Content summarization
- Key topic extraction
- Sentiment/tone analysis
- Action-item extraction

### 📄 Document Understanding

- Upload PDF documents
- Process multi-page documents
- Extract structured information
- Analyze document content using AI
- Support questions about uploaded documents
- Display structured analysis results

### 💬 Unified AI Chat

- Conversational interface supporting multiple media types
- Conversation history
- Upload media and continue asking questions
- Inline media references
- Markdown-rendered AI responses
- Code block syntax highlighting
- Streaming responses using Server-Sent Events (SSE)

### 📁 Media Gallery

- Sidebar displaying uploaded media
- Image, video, audio, and document previews
- Re-reference uploaded media in conversations
- Media organized by conversation/session
- Server-side file storage
- Automatic cleanup of old uploaded files

### 🔄 Conversation Management

- Create new conversations
- Switch between conversations
- Maintain conversation context
- Clear conversations
- Media associated with conversations
- Context management for longer conversations

### 🛡️ File Validation & Error Handling

- MIME-type validation
- Magic-byte based file validation
- File-size limits
- Corrupt/invalid file detection
- Processing error handling
- API error handling
- Upload progress and processing states
- Clear user-facing error messages

---

## 🏗️ Architecture

```text
                    ┌─────────────────────────┐
                    │       Next.js UI        │
                    │  React + TypeScript     │
                    │       Tailwind CSS      │
                    └────────────┬────────────┘
                                 │
                                 │ REST / SSE
                                 ▼
                    ┌─────────────────────────┐
                    │     Express Backend     │
                    │       Node.js           │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
       ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
       │    Image    │    │    Video    │    │    Audio    │
       │   Analysis  │    │   FFmpeg    │    │   Whisper   │
       └──────┬──────┘    │Frame Extract│    │Transcription│
              │           └──────┬──────┘    └──────┬──────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       AI Services      │
                    │                         │
                    │    Gemini Vision       │
                    │    Whisper / Groq      │
                    └─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │        SQLite DB        │
                    │ Conversations / Media   │
                    │ Messages / Metadata     │
                    └─────────────────────────┘
