(function () {
	'use strict';
	const BUTTON_ID = 'DS_MarkdownExport';
	let isProcessing = false;

	const SELECTORS = {
		MESSAGE: 'dad65929',
		USER_PROMPT: 'fa81',
		AI_ANSWER: 'f9bf7997',
		AI_THINKING: 'e1675d8b',
		AI_RESPONSE: 'ds-markdown',
		TITLE: 'd8ed659a'
	};

	function createUI() {
		if (document.getElementById(BUTTON_ID)) return;

		const container = document.createElement('div');
		container.id = `${BUTTON_ID}-container`;

		const copyBtn = document.createElement('button');
		copyBtn.id = `${BUTTON_ID}-copy`;
		copyBtn.textContent = '📋';
		copyBtn.title = '复制到剪贴板';
		copyBtn.onclick = () => handleExport('clipboard');

		const exportBtn = document.createElement('button');
		exportBtn.id = BUTTON_ID;
		exportBtn.textContent = '💾';
		exportBtn.title = '导出对话';
		exportBtn.onclick = () => handleExport('file');

		container.append(copyBtn, exportBtn);
		document.body.append(container);
	}

	async function handleExport(mode) {
		if (isProcessing) return;
		isProcessing = true;

		try {
			const conversations = await extractConversations();
			if (!conversations.length) {
				showToast('未检测到有效对话内容', true);
				return;
			}

			const content = formatMarkdown(conversations);

			if (mode === 'file') {
				downloadMarkdown(content);
			} else {
				navigator.clipboard
					.writeText(content)
					.then(() => {
						showToast('对话内容已复制到剪贴板');
					})
					.catch((error) => {
						showToast(`复制失败: ${error.message}`, true);
					});
			}
		} catch (error) {
			console.error('[导出错误]', error);
			showToast(`操作失败: ${error.message}`, true);
		} finally {
			isProcessing = false;
		}
	}

	function extractConversations() {
		return new Promise((resolve) => {
			requestAnimationFrame(() => {
				const conversations = [];
				const blocks = document.querySelector(`.${SELECTORS.MESSAGE}`)?.childNodes;

				blocks.forEach((block) => {
					try {
						if (block.classList.contains(SELECTORS.USER_PROMPT)) {
							conversations.push({
								content: cleanContent(block, 'prompt'),
								type: 'user'
							});
						} else if (block.classList.contains(SELECTORS.AI_ANSWER)) {
							const thinkingNode = block.querySelector(`.${SELECTORS.AI_THINKING}`);
							const responseNode = block.querySelector(`.${SELECTORS.AI_RESPONSE}`);
							conversations.push({
								content: {
									thinking: thinkingNode
										? cleanContent(thinkingNode, 'thinking')
										: '',
									response: responseNode
										? cleanContent(responseNode, 'response')
										: ''
								},
								type: 'ai'
							});
						}
					} catch (e) {
						console.warn('[对话解析错误]', e);
					}
				});

				resolve(conversations);
			});
		});
	}

	function cleanContent(node, type) {
		const clone = node.cloneNode(true);
		clone
			.querySelectorAll('button, .ds-flex, .ds-icon, .ds-icon-button, .ds-button,svg')
			.forEach((el) => el.remove());

		switch (type) {
			case 'prompt':
				return clone.textContent.replace(/\n{2,}/g, '\n').trim();

			case 'thinking':
				return clone.innerHTML
					.replace(/<\/p>/gi, '\n')
					.replace(/<br\s*\/?>/gi, '\n')
					.replace(/<\/?[^>]+(>|$)/g, '')
					.replace(/\n+/g, '\n')
					.trim();
			case 'response':
				return clone.innerHTML;
			default:
				return clone.textContent.trim();
		}
	}

	function formatMarkdown(conversations) {
		const titleElement = document.querySelector(`.${SELECTORS.TITLE}`);
		const title = titleElement ? titleElement.textContent.trim() : 'DeepSeek对话';

		let md = `# ${title}\n\n`;

		conversations.forEach((conv, idx) => {
			if (conv.type === 'user') {
				if (idx > 0) md += '\n---\n';
				let ask = conv.content.split('\n').join('\n> ');
				md += `\n> [! 💬 提问]\n> ${ask}\n\n`;
			}

			if (conv.type === 'ai' && conv.content) {
				if (conv.content.thinking) {
					let thinking = conv.content.thinking.split('\n').join('\n> ');
					md += `**🤔 思考**\n> ${thinking}\n`;
				}

				if (conv.content.response) {
					md += `\n${enhancedHtmlToMarkdown(conv.content.response)}\n`;
				}
			}
		});

		return md;
	}

	function enhancedHtmlToMarkdown(html) {
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html;

		tempDiv.querySelectorAll('.md-code-block').forEach((codeBlock) => {
			const lang =
				codeBlock.querySelector('.md-code-block-infostring')?.textContent?.trim() || '';
			const codeContent = codeBlock.querySelector('pre')?.textContent || '';
			codeBlock.replaceWith(`\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n`);
		});

		return Array.from(tempDiv.childNodes)
			.map((node) => {
				return convertNodeToMarkdown(node);
			})
			.join('')
			.trim();
	}

	function convertNodeToMarkdown(node) {
		const handlers = {
			P: (n) => `${n.textContent}\n\n`,
			STRONG: (n) => `**${n.textContent}**`,
			EM: (n) => `*${n.textContent}*`,
			UL: (n) =>
				`${Array.from(n.querySelectorAll('li'))
					.map((li) => `- ${li.textContent}`)
					.join('\n')}\n\n`,
			OL: (n) =>
				`${Array.from(n.querySelectorAll('li'))
					.map((li, i) => `${i + 1}. ${li.textContent}`)
					.join('\n')}\n\n`,
			PRE: (n) => `\n\`\`\`\n${n.textContent}\n\`\`\`\n`,
			CODE: (n) => `\`${n.textContent}\``,
			H1: (n) => `# ${n.textContent}\n\n`,
			H2: (n) => `## ${n.textContent}\n\n`,
			H3: (n) => `### ${n.textContent}\n\n`,
			TABLE: (n) => {
				const rows = Array.from(n.querySelectorAll('tr'));
				if (rows.length === 0) return '';

				const headers = Array.from(rows[0].querySelectorAll('th,td')).map((cell) =>
					cell.textContent.trim()
				);
				let markdown = `\n| ${headers.join(' | ')} |\n| ${headers
					.map(() => '---')
					.join(' | ')} |\n`;

				for (let i = 1; i < rows.length; i++) {
					const cells = Array.from(rows[i].querySelectorAll('td')).map((cell) =>
						cell.textContent.trim()
					);
					markdown += `| ${cells.join(' | ')} |\n`;
				}

				return markdown + '\n';
			},
			DIV: (n) => '',
			'#text': (n) => n.textContent,
			_default: (n) => n.textContent
		};

		return handlers[node.nodeName]?.(node) || handlers._default(node);
	}

	function downloadMarkdown(content) {
		const titleElement = document.querySelector(`.${SELECTORS.TITLE}`);
		const title = titleElement ? titleElement.textContent.trim() : 'DeepSeek对话';
		const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${title}.md`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function showToast(message, isError = false) {
		const toast = document.createElement('div');
		toast.className = `ds-toast ${isError ? 'error' : 'success'}`;
		toast.textContent = message;
		document.body.appendChild(toast);

		toast.addEventListener('animationend', () => {
			document.body.removeChild(toast);
		});
	}

	const observer = new MutationObserver(() => createUI());
	observer.observe(document, { childList: true, subtree: true });
	window.addEventListener('load', createUI);
	setInterval(createUI, 3000);
})();
