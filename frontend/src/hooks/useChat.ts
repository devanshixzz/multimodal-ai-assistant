"use client";

import {
  useCallback,
  useReducer,
} from "react";

import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversations,
  sendChat,
} from "../lib/api";

import type {
  ChatMessage,
  Conversation,
} from "../lib/types";

interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
}

type ChatAction =
  | {
      type: "SET_LOADING";
      value: boolean;
    }
  | {
      type: "SET_SENDING";
      value: boolean;
    }
  | {
      type: "SET_ERROR";
      error: string | null;
    }
  | {
      type: "SET_CONVERSATIONS";
      conversations: Conversation[];
    }
  | {
      type: "SET_CONVERSATION";
      conversation: Conversation | null;
    }
  | {
      type: "SET_MESSAGES";
      messages: ChatMessage[];
    }
  | {
      type: "ADD_MESSAGE";
      message: ChatMessage;
    }
  | {
      type: "UPDATE_MESSAGE";
      message: ChatMessage;
    }
  | {
      type: "RESET";
    };

const initialState: ChatState = {
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  isSending: false,
  error: null,
};

function chatReducer(
  state: ChatState,
  action: ChatAction
): ChatState {
  switch (action.type) {
    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.value,
      };

    case "SET_SENDING":
      return {
        ...state,
        isSending: action.value,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
      };

    case "SET_CONVERSATIONS":
      return {
        ...state,
        conversations: action.conversations,
      };

    case "SET_CONVERSATION":
      return {
        ...state,
        currentConversation:
          action.conversation,
        messages:
          action.conversation?.messages || [],
      };

    case "SET_MESSAGES":
      return {
        ...state,
        messages: action.messages,
      };

    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          action.message,
        ],
      };

    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map(
          (message) =>
            message.id === action.message.id
              ? action.message
              : message
        ),
      };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

/**
 * Message shown immediately while the backend
 * is processing the request.
 */
function getProcessingMessage(
  mediaIds: string[]
): string {
  if (mediaIds.length === 0) {
    return "✨ Thinking...";
  }

  if (mediaIds.length === 1) {
    return "🔄 Analyzing the selected media and preparing your answer...";
  }

  return "🔄 Analyzing the selected media files and preparing your answer...";
}

export function useChat() {
  const [state, dispatch] = useReducer(
    chatReducer,
    initialState
  );

  /**
   * Load conversation list.
   */
  const loadConversations =
    useCallback(async () => {
      dispatch({
        type: "SET_LOADING",
        value: true,
      });

      dispatch({
        type: "SET_ERROR",
        error: null,
      });

      try {
        const result =
          await getConversations();

        dispatch({
          type: "SET_CONVERSATIONS",
          conversations:
            result.conversations,
        });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error:
            error instanceof Error
              ? error.message
              : "Failed to load conversations.",
        });
      } finally {
        dispatch({
          type: "SET_LOADING",
          value: false,
        });
      }
    }, []);

  /**
   * Open a conversation.
   */
  const openConversation =
    useCallback(
      async (conversationId: string) => {
        dispatch({
          type: "SET_LOADING",
          value: true,
        });

        dispatch({
          type: "SET_ERROR",
          error: null,
        });

        try {
          const result =
            await getConversation(
              conversationId
            );

          dispatch({
            type: "SET_CONVERSATION",
            conversation:
              result.conversation,
          });
        } catch (error) {
          dispatch({
            type: "SET_ERROR",
            error:
              error instanceof Error
                ? error.message
                : "Failed to open conversation.",
          });
        } finally {
          dispatch({
            type: "SET_LOADING",
            value: false,
          });
        }
      },
      []
    );

  /**
   * Create a new conversation.
   */
  const newConversation =
    useCallback(
      async (
        title = "New Conversation"
      ) => {
        dispatch({
          type: "SET_ERROR",
          error: null,
        });

        try {
          const result =
            await createConversation(
              title
            );

          dispatch({
            type: "SET_CONVERSATION",
            conversation:
              result.conversation,
          });

          dispatch({
            type: "SET_CONVERSATIONS",
            conversations: [
              result.conversation,
              ...state.conversations,
            ],
          });

          return result.conversation;
        } catch (error) {
          dispatch({
            type: "SET_ERROR",
            error:
              error instanceof Error
                ? error.message
                : "Failed to create conversation.",
          });

          return null;
        }
      },
      [state.conversations]
    );

  /**
   * Send a normal non-streaming chat message.
   *
   * UX:
   *
   * 1. User message appears immediately.
   * 2. Processing message appears immediately.
   * 3. Backend processes request.
   * 4. Temporary messages are replaced by
   *    the real backend messages.
   */
  const sendMessage =
    useCallback(
      async (
        message: string,
        mediaIds: string[] = []
      ) => {
        const trimmedMessage =
          message.trim();

        if (
          !trimmedMessage ||
          state.isSending
        ) {
          return;
        }

        /*
         * We need a conversation_id because
         * ChatMessage requires it.
         *
         * For an existing conversation, use
         * the real ID.
         *
         * For a brand-new conversation, use
         * a temporary frontend-only ID.
         * The temporary messages are discarded
         * once the backend creates the real
         * conversation.
         */
        const temporaryConversationId =
          state.currentConversation?.id ??
          `temp-conversation-${Date.now()}`;

        /**
         * Temporary user message.
         */
        const temporaryUserMessage:
          ChatMessage = {
            id: `temp-user-${Date.now()}`,
            conversation_id:
              temporaryConversationId,
            role: "user",
            content: trimmedMessage,
            media_refs: mediaIds,
            metadata: {},
            created_at:
              new Date().toISOString(),
          };

        /**
         * Temporary assistant processing message.
         */
        const temporaryProcessingMessage:
          ChatMessage = {
            id: `processing-${Date.now()}`,
            conversation_id:
              temporaryConversationId,
            role: "assistant",
            content:
              getProcessingMessage(
                mediaIds
              ),
            media_refs: [],
            metadata: {},
            created_at:
              new Date().toISOString(),
          };

        /*
         * Immediately display the user's message.
         */
        dispatch({
          type: "ADD_MESSAGE",
          message:
            temporaryUserMessage,
        });

        /*
         * Immediately display the processing
         * message.
         */
        dispatch({
          type: "ADD_MESSAGE",
          message:
            temporaryProcessingMessage,
        });

        dispatch({
          type: "SET_SENDING",
          value: true,
        });

        dispatch({
          type: "SET_ERROR",
          error: null,
        });

        try {
          const result =
            await sendChat(
              trimmedMessage,
              state.currentConversation?.id,
              mediaIds
            );

          /*
           * If the backend created a new
           * conversation automatically,
           * fetch the complete conversation.
           */
          if (
            !state.currentConversation ||
            state.currentConversation.id !==
              result.conversationId
          ) {
            const conversation =
              await getConversation(
                result.conversationId
              );

            dispatch({
              type: "SET_CONVERSATION",
              conversation:
                conversation.conversation,
            });

            await loadConversations();
          } else {
            /*
             * Existing conversation.
             *
             * Remove the temporary messages
             * and replace them with the real
             * backend messages.
             */
            const cleanedMessages =
              state.messages.filter(
                (item) =>
                  item.id !==
                    temporaryUserMessage.id &&
                  item.id !==
                    temporaryProcessingMessage.id
              );

            dispatch({
              type: "SET_MESSAGES",
              messages: [
                ...cleanedMessages,
                result.userMessage,
                result.assistantMessage,
              ],
            });

            /*
             * Keep conversation sidebar
             * synchronized.
             */
            await loadConversations();
          }

          return result;
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to send message.";

          /*
           * Remove the temporary messages.
           */
          const cleanedMessages =
            state.messages.filter(
              (item) =>
                item.id !==
                  temporaryUserMessage.id &&
                item.id !==
                  temporaryProcessingMessage.id
            );

          /*
           * Show the user's message followed
           * by a readable error message.
           */
          const errorAssistantMessage:
            ChatMessage = {
              id: `error-${Date.now()}`,
              conversation_id:
                temporaryConversationId,
              role: "assistant",
              content:
                `I couldn't complete that request.\n\n` +
                `${errorMessage}\n\n` +
                `Please check the uploaded media or try again.`,
              media_refs: [],
              metadata: {
                error: true,
              },
              created_at:
                new Date().toISOString(),
            };

          dispatch({
            type: "SET_MESSAGES",
            messages: [
              ...cleanedMessages,
              temporaryUserMessage,
              errorAssistantMessage,
            ],
          });

          dispatch({
            type: "SET_ERROR",
            error: errorMessage,
          });

          return null;
        } finally {
          dispatch({
            type: "SET_SENDING",
            value: false,
          });
        }
      },
      [
        state.currentConversation,
        state.messages,
        state.isSending,
        loadConversations,
      ]
    );

  /**
   * Delete a conversation.
   */
  const removeConversation =
    useCallback(
      async (
        conversationId: string
      ) => {
        try {
          await deleteConversation(
            conversationId
          );

          dispatch({
            type: "SET_CONVERSATIONS",
            conversations:
              state.conversations.filter(
                (conversation) =>
                  conversation.id !==
                  conversationId
              ),
          });

          if (
            state.currentConversation?.id ===
            conversationId
          ) {
            dispatch({
              type: "SET_CONVERSATION",
              conversation: null,
            });
          }

          return true;
        } catch (error) {
          dispatch({
            type: "SET_ERROR",
            error:
              error instanceof Error
                ? error.message
                : "Failed to delete conversation.",
          });

          return false;
        }
      },
      [
        state.conversations,
        state.currentConversation,
      ]
    );

  /**
   * Clear the current error.
   */
  const clearError =
    useCallback(() => {
      dispatch({
        type: "SET_ERROR",
        error: null,
      });
    }, []);

  return {
    state,
    dispatch,
    loadConversations,
    openConversation,
    newConversation,
    sendMessage,
    removeConversation,
    clearError,
  };
}
