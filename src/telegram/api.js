export class TelegramApi {
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.assetBaseUrl = `https://api.telegram.org/${'file'}/bot${token}`;
  }

  async call(method, payload = {}) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      const message = body?.description ?? response.statusText;
      throw new Error(`Telegram ${method} failed: ${message}`);
    }

    return body.result;
  }

  async callMultipart(method, formData) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      body: formData
    });

    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      const message = body?.description ?? response.statusText;
      throw new Error(`Telegram ${method} failed: ${message}`);
    }

    return body.result;
  }

  getUpdates(payload) {
    return this.call('getUpdates', payload);
  }

  getMe() {
    return this.call('getMe');
  }

  sendMessage(chatId, text, options = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });
  }

  sendDocument(chatId, { buffer, filename, caption = '' }) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('document', new Blob([buffer], { type: 'application/json' }), filename);
    if (caption) {
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
    }
    return this.callMultipart('sendDocument', form);
  }

  editMessageText(chatId, messageId, text, options = {}) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });
  }

  answerCallbackQuery(callbackQueryId, options = {}) {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...options
    });
  }

  getChatMember(chatId, userId) {
    return this.call('getChatMember', {
      chat_id: chatId,
      user_id: userId
    });
  }

  getFile(fileId) {
    return this.call('getFile', {
      file_id: fileId
    });
  }

  async fetchFile(filePath) {
    const response = await fetch(`${this.assetBaseUrl}/${filePath}`);
    if (!response.ok) {
      throw new Error(`Telegram file fetch failed: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  setMyCommands(commands) {
    return this.call('setMyCommands', { commands });
  }
}
