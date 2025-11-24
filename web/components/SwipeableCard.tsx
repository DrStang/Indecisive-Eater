'use client';
import { useState } from 'react';
import { motion, PanInfo, useMotionValue, useTransform } from 'framer-motion';

interface Props {
    restaurant: any;
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    onSwipeDown: () => void;
}

export default function SwipeableCard({ restaurant, onSwipeLeft, onSwipeRight, onSwipeDown }: Props) {
    const [exitX, setExitX] = useState(0);
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-25, 25]);
    const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);

    function handleDragEnd(event: any, info: PanInfo) {
        if (info.offset.x > 100) {
            setExitX(200);
            onSwipeRight();
        } else if (info.offset.x < -100) {
            setExitX(-200);
            onSwipeLeft();
        } else if (info.offset.y > 100) {
            onSwipeDown();
        }
    }

    return (
        <motion.div
            style={{ x, rotate, opacity }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            className="bg-white rounded-2xl border-2 p-6 cursor-grab active:cursor-grabbing shadow-lg"
        >
            <h3 className="text-2xl font-bold mb-2">{restaurant.name}</h3>
            <p className="text-slate-600 mb-4">{restaurant.address}</p>

            {restaurant.rating && (
                <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded-full mb-4">
                    ⭐ {restaurant.rating.toFixed(1)}
                </div>
            )}

            {restaurant.description && (
                <p className="text-sm mb-4">{restaurant.description}</p>
            )}

            {restaurant.reasons && restaurant.reasons.length > 0 && (
                <div className="bg-indigo-50 rounded-lg p-3 text-sm">
                    <strong>Why this place:</strong>
                    <ul className="list-disc list-inside mt-1">
                        {restaurant.reasons.map((r: string, i: number) => (
                            <li key={i}>{r}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-6 text-sm text-slate-500 text-center">
                ← Swipe left: Not now | Swipe right: Favorite! →
            </div>
        </motion.div>
    );
}