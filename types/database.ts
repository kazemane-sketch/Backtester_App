export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      instruments: {
        Row: {
          id: string;
          symbol: string;
          type: "stock" | "etf";
          isin: string | null;
          name: string;
          exchange: string;
          currency: string;
          provider: "EODHD" | "YAHOO";
          provider_instrument_id: string;
          metadata: Json;
          search_document: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          type?: "stock" | "etf";
          isin?: string | null;
          name: string;
          exchange: string;
          currency: string;
          provider?: "EODHD" | "YAHOO";
          provider_instrument_id: string;
          metadata?: Json;
          search_document?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["instruments"]["Insert"]>;
      };
      etf_fundamentals: {
        Row: {
          instrument_id: string;
          index_name: string | null;
          domicile: string | null;
          category: string | null;
          description: string | null;
          updated_at_provider: string | null;
          raw: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          instrument_id: string;
          index_name?: string | null;
          domicile?: string | null;
          category?: string | null;
          description?: string | null;
          updated_at_provider?: string | null;
          raw?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["etf_fundamentals"]["Insert"]>;
      };
      etf_country_weights: {
        Row: {
          instrument_id: string;
          country: string;
          weight: number;
          created_at: string;
        };
        Insert: {
          instrument_id: string;
          country: string;
          weight: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["etf_country_weights"]["Insert"]>;
      };
      etf_region_weights: {
        Row: {
          instrument_id: string;
          region: string;
          equity_pct: number;
          created_at: string;
        };
        Insert: {
          instrument_id: string;
          region: string;
          equity_pct: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["etf_region_weights"]["Insert"]>;
      };
      etf_sector_weights: {
        Row: {
          instrument_id: string;
          sector: string;
          equity_pct: number;
          created_at: string;
        };
        Insert: {
          instrument_id: string;
          sector: string;
          equity_pct: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["etf_sector_weights"]["Insert"]>;
      };
      instrument_embeddings: {
        Row: {
          instrument_id: string;
          embedding: number[];
          embedding_text: string;
          model: string;
          updated_at: string;
        };
        Insert: {
          instrument_id: string;
          embedding: number[];
          embedding_text: string;
          model: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["instrument_embeddings"]["Insert"]>;
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
    Views: {
      instrument_search_view: {
        Row: {
          instrument_id: string;
          symbol: string;
          name: string;
          isin: string | null;
          type: string;
          exchange: string;
          currency: string;
          provider: string;
          index_name: string | null;
          domicile: string | null;
          category: string | null;
          description: string | null;
          search_document: string;
        };
      };
    };
    Functions: {
      match_instruments: {
        Args: {
          query_embedding: number[];
          match_count?: number;
          filter_type?: string | null;
        };
        Returns: {
          instrument_id: string;
          symbol: string;
          name: string;
          isin: string | null;
          type: string;
          index_name: string | null;
          domicile: string | null;
          category: string | null;
          similarity: number;
        }[];
      };
      suggest_instruments: {
        Args: {
          query_text: string;
          requested_type?: string | null;
          limit_count?: number;
        };
        Returns: {
          instrument_id: string;
          symbol: string;
          name: string;
          isin: string | null;
          type: string;
          exchange: string;
          currency: string;
          index_name: string | null;
          domicile: string | null;
          category: string | null;
          score: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
