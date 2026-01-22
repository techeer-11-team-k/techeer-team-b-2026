import React from 'react';

export const TrendIcon = ({ type, className = "" }: { type: 'up' | 'down', className?: string }) => {
    if (type === 'up') {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
                <path d="M12.7071 5.29289C12.3166 4.90237 11.6834 4.90237 11.2929 5.29289L6.5 10.0858C5.97505 10.6107 6.34685 11.5 7.0892 11.5H9.5V17C9.5 17.5523 9.94772 18 10.5 18H13.5C14.0523 18 14.5 17.5523 14.5 17V11.5H16.9108C17.6532 11.5 18.025 10.6107 17.5 10.0858L12.7071 5.29289Z" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
            <path d="M11.2929 18.7071C11.6834 19.0976 12.3166 19.0976 12.7071 18.7071L17.5 13.9142C18.025 13.3893 17.6532 12.5 16.9108 12.5H14.5V7C14.5 6.44772 14.0523 6 13.5 6H10.5C9.94772 6 9.5 6.44772 9.5 7V12.5H7.0892C6.34685 12.5 5.97505 13.3893 6.5 13.9142L11.2929 18.7071Z" />
        </svg>
    );
};