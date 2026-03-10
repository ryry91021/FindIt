import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

export type ModalProps<TOverlay extends ElementType = 'div', TContent extends ElementType = 'section'> = {
    open: boolean
    onRequestClose: () => void
    overlayClassName: string
    contentClassName: string
    closeOnOverlayClick?: boolean
    overlayAs?: TOverlay
    contentAs?: TContent
    overlayProps?: Omit<ComponentPropsWithoutRef<TOverlay>, 'className' | 'onClick' | 'children'> & {
        className?: string
        onClick?: ComponentPropsWithoutRef<TOverlay>['onClick']
    }
    contentProps?: Omit<ComponentPropsWithoutRef<TContent>, 'className' | 'onClick' | 'children'> & {
        className?: string
        onClick?: ComponentPropsWithoutRef<TContent>['onClick']
    }
    children: ReactNode
}

export function Modal<TOverlay extends ElementType = 'div', TContent extends ElementType = 'section'>(
    props: ModalProps<TOverlay, TContent>
) {
    const {
        open,
        onRequestClose,
        overlayClassName,
        contentClassName,
        closeOnOverlayClick = true,
        overlayAs,
        contentAs,
        overlayProps,
        contentProps,
        children,
    } = props

    if (!open) return null

    type OverlayClickEvent = Parameters<NonNullable<ComponentPropsWithoutRef<TOverlay>['onClick']>>[0]
    type ContentClickEvent = Parameters<NonNullable<ComponentPropsWithoutRef<TContent>['onClick']>>[0]

    const OverlayTag = (overlayAs ?? 'div') as ElementType
    const ContentTag = (contentAs ?? 'section') as ElementType

    const overlayMergedClassName = [overlayClassName, overlayProps?.className]
        .filter(Boolean)
        .join(' ')
    const contentMergedClassName = [contentClassName, contentProps?.className]
        .filter(Boolean)
        .join(' ')

    return (
        <OverlayTag
            {...overlayProps}
            className={overlayMergedClassName}
            onClick={(event: OverlayClickEvent) => {
                overlayProps?.onClick?.(event)
                const overlayEvent = event as unknown as { defaultPrevented?: boolean }
                if (overlayEvent.defaultPrevented) return
                if (!closeOnOverlayClick) return
                onRequestClose()
            }}
        >
            <ContentTag
                {...contentProps}
                className={contentMergedClassName}
                role={contentProps?.role ?? 'dialog'}
                aria-modal={contentProps?.['aria-modal'] ?? true}
                onClick={(event: ContentClickEvent) => {
                    const contentEvent = event as unknown as { stopPropagation?: () => void }
                    contentEvent.stopPropagation?.()
                    contentProps?.onClick?.(event)
                }}
            >
                {children}
            </ContentTag>
        </OverlayTag>
    )
}
