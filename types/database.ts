export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      instruments: {
        Row: {
          id: string;
          symbol: string;
          isin: string | null;
          name: string;
          exchange: string;
          currency: string;
          provider: "EODHD" | "YAHOO";
          provider_instrument_id: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          isin?: string | null;
          name: string;
          exchange: string;
          currency: string;
          provider: "EODHD" | "YAHOO";
          provider_instrument_id: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["instruments"]["Insert"]>;
      };
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portfolios"]["Insert"]>;
      };
      portfolio_assets: {
        Row: {
          id: string;
          user_id: string;
          portfolio_id: string;
          instrument_id: string;
          weight: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_id: string;
          instrument_id: string;
          weight: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portfolio_assets"]["Insert"]>;
      };
      backtest_runs: {
        Row: {
          id: string;
          user_id: string;
          portfolio_id: string | null;
          name: string;
          status: "pending" | "running" | "completed" | "failed";
          config: Json;
          data_provider: "EODHD" | "YAHOO";
          error_message: string | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_id?: string | null;
          name: string;
          status: "pending" | "running" | "completed" | "failed";
          config: Json;
          data_provider: "EODHD" | "YAHOO";
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["backtest_runs"]["Insert"]>;
      };
      backtest_results_summary: {
        Row: {
          run_id: string;
          user_id: string;
          total_return: number;
          cagr: number;
          volatility_ann: number;
          sharpe: number;
          max_drawdown: number;
          calmar: number;
          total_fees: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          run_id: string;
          user_id: string;
          total_return: number;
          cagr: number;
          volatility_ann: number;
          sharpe: number;
          max_drawdown: number;
          calmar: number;
          total_fees: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["backtest_results_summary"]["Insert"]>;
      };
      backtest_timeseries: {
        Row: {
          id: number;
          run_id: string;
          user_id: string;
          t: string;
          portfolio_value: number;
          benchmark_value: number | null;
          daily_return: number;
          drawdown: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          run_id: string;
          user_id: string;
          t: string;
          portfolio_value: number;
          benchmark_value?: number | null;
          daily_return: number;
          drawdown: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["backtest_timeseries"]["Insert"]>;
      };
      backtest_trades: {
        Row: {
          id: string;
          run_id: string;
          user_id: string;
          trade_date: string;
          instrument_id: string | null;
          symbol: string;
          side: "buy" | "sell";
          quantity: number;
          price: number;
          gross_amount: number;
          fee_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          user_id: string;
          trade_date: string;
          instrument_id?: string | null;
          symbol: string;
          side: "buy" | "sell";
          quantity: number;
          price: number;
          gross_amount: number;
          fee_amount: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["backtest_trades"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
