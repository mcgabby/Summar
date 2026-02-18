import { Modal, App } from 'obsidian';

export class RecordingEndPromptModal extends Modal {
    private eventTitle: string;
    private onStop: () => void;
    private onRemind: () => void;

    constructor(app: App, eventTitle: string, onStop: () => void, onRemind: () => void) {
        super(app);
        this.eventTitle = eventTitle;
        this.onStop = onStop;
        this.onRemind = onRemind;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Meeting Recording' });
        contentEl.createEl('p', {
            text: `"${this.eventTitle}" has ended. Would you like to stop the recording?`
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const stopButton = buttonContainer.createEl('button', { text: 'Stop Recording', cls: 'mod-cta' });
        stopButton.addEventListener('click', () => {
            this.close();
            this.onStop();
        });

        const remindButton = buttonContainer.createEl('button', { text: 'Remind in 5 min' });
        remindButton.addEventListener('click', () => {
            this.close();
            this.onRemind();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
