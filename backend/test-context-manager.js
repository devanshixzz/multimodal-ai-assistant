import {
  createConversation,
  getConversation,
  addMessage,
  getContextMessages,
  shouldSummarize,
  deleteConversation,
} from "./src/services/context-manager.js";

const conversation = createConversation("Test Conversation");

console.log("Created:", conversation.id);

addMessage(
  conversation.id,
  "user",
  "Hello, this is a test message."
);

addMessage(
  conversation.id,
  "assistant",
  "Hello! I am the AI assistant."
);

const fullConversation = getConversation(conversation.id);

console.log("\nConversation:");
console.log(fullConversation);

const context = getContextMessages(conversation.id);

console.log("\nContext:");
console.log(context);

console.log(
  "\nShould summarize:",
  shouldSummarize(conversation.id)
);

console.log(
  "\nDeleted:",
  deleteConversation(conversation.id)
);