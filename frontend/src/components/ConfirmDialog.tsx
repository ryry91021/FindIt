import type { ReactNode } from 'react'
import { Modal } from './Modal'

export type ConfirmDialogProps = {
    open: boolean
    onCancel: () => void
    onConfirm: () => void
    title: string
    message?: ReactNode
    ariaLabel: string
    busy?: boolean
    confirmLabel?: string
    cancelLabel?: string
    overlayClassName?: string
    contentClassName?: string
    cancelButtonClassName?: string
    confirmButtonClassName?: string
}

export function ConfirmDialog(props: ConfirmDialogProps) {
    const {
        open,
        onCancel,
        onConfirm,
        title,
        message,
        ariaLabel,
        busy = false,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        overlayClassName = 'group-modal-overlay',
        contentClassName = 'board-edit-popup',
        cancelButtonClassName = 'board-management-button',
        confirmButtonClassName = 'board-management-danger',
    } = props

    return (
        <Modal
            open={open}
            onRequestClose={onCancel}
            overlayClassName={overlayClassName}
            contentClassName={contentClassName}
            contentProps={{
                'aria-label': ariaLabel,
            }}
        >
            <h3>{title}</h3>
            {typeof message === 'string' ? <p>{message}</p> : message}
            <div className="board-edit-popup-actions">
                <button type="button" className={cancelButtonClassName} onClick={onCancel}>
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    className={confirmButtonClassName}
                    onClick={onConfirm}
                    disabled={busy}
                >
                    {confirmLabel}
                </button>
            </div>
        </Modal>
    )
}
