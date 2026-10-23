import React, { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
  subYears
} from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  BookHeart,
  CalendarDays,
  Camera,
  LogOut,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  X
} from 'lucide-react';
import { supabase, supabaseConfigured } from './supabase';

const todayKey = () => format(new Date(), 'yyyy-MM-dd');

const errorText = (error) =>
  error?.message || 'Something went wrong. Please try again later.';

function AuthPanel({ onClose, onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      if (!supabase) {
        throw new Error(
          'Supabase is not connected. Please check your .env settings.'
        );
      }

      if (mode === 'signup') {
        if (password.length < 8) {
          throw new Error('Your password must be at least 8 characters long.');
        }

        const cleanName = displayName.trim();

        if (cleanName.length < 2 || cleanName.length > 40) {
          throw new Error('Your display name must be between 2 and 40 characters.');
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: cleanName }
          }
        });

        if (error) throw error;

        if (data.session) {
          setMessage('Account created successfully. Welcome!');
          onDone(data.session.user);
        } else {
          setMessage(
            'Your account has been created. If you cannot sign in yet, check your email confirmation settings in Supabase.'
          );
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
