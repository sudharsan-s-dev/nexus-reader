const NexusUI = {
    _createModal(type, message, onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.className = 'nexus-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = `nexus-modal-box ${type}`;
        
        const icon = document.createElement('div');
        icon.className = 'nexus-modal-icon';
        icon.innerHTML = type === 'confirm' ? '<i class="fa-solid fa-circle-question"></i>' : '<i class="fa-solid fa-circle-exclamation"></i>';
        
        const text = document.createElement('p');
        text.className = 'nexus-modal-text';
        text.innerHTML = message.replace(/\n/g, '<br>');
        
        const actions = document.createElement('div');
        actions.className = 'nexus-modal-actions';
        
        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'btn-confirm';
        btnConfirm.textContent = type === 'confirm' ? 'OK' : 'Close';
        
        btnConfirm.onclick = () => {
            document.body.removeChild(overlay);
            if(onConfirm) onConfirm();
        };
        
        if (type === 'confirm') {
            const btnCancel = document.createElement('button');
            btnCancel.className = 'btn-cancel';
            btnCancel.textContent = 'Cancel';
            btnCancel.onclick = () => {
                document.body.removeChild(overlay);
                if(onCancel) onCancel();
            };
            actions.appendChild(btnCancel);
        }
        
        actions.appendChild(btnConfirm);
        modal.appendChild(icon);
        modal.appendChild(text);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },
    alert(message) {
        return new Promise(resolve => this._createModal('alert', message, resolve));
    },
    confirm(message) {
        return new Promise((resolve) => {
            this._createModal('confirm', message, () => resolve(true), () => resolve(false));
        });
    }
};

window.alert = (msg) => NexusUI.alert(msg);
