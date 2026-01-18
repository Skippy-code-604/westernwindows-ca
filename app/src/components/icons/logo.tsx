export function Logo() {
    return (
        <svg
            viewBox="0 0 48 48"
            className="h-8 w-8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Window frame - navy blue */}
            <rect
                x="4"
                y="8"
                width="40"
                height="32"
                rx="2"
                stroke="#1B3A5F"
                strokeWidth="3"
                fill="none"
            />
            {/* Horizontal divider */}
            <line x1="4" y1="24" x2="44" y2="24" stroke="#1B3A5F" strokeWidth="2" />
            {/* Vertical divider */}
            <line x1="24" y1="8" x2="24" y2="40" stroke="#1B3A5F" strokeWidth="2" />
            {/* Sun accent - orange */}
            <circle cx="36" cy="16" r="4" fill="#F7A828" />
            {/* Sky accent - light blue */}
            <path
                d="M26 10 L42 10 L42 22 L26 22 Z"
                fill="#5BA4C9"
                opacity="0.3"
            />
        </svg>
    );
}
