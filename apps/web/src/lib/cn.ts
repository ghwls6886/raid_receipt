import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind CSS 클래스를 조합하는 유틸리티 함수
 *
 * - clsx: 조건부 클래스 조합
 * - twMerge: Tailwind 클래스 충돌 해결 (예: "px-2 px-4" -> "px-4")
 *
 * @example
 * cn('px-4', isActive && 'bg-blue-500', { 'opacity-50': disabled })
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
