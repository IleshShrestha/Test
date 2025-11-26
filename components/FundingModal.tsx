"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { trpc } from "@/lib/trpc/client";
import {
  normalizeCardNumber,
  validateCardNumber,
} from "@/lib/utils/cardValidation";
import { normalizeFundingAmount } from "@/lib/utils/fundingNormalization";

interface FundingModalProps {
  accountId: number;
  onClose: () => void;
  onSuccess: () => void;
}

type FundingFormData = {
  amount: string;
  fundingType: "card" | "bank";
  accountNumber: string;
  routingNumber: string;
};

export function FundingModal({
  accountId,
  onClose,
  onSuccess,
}: FundingModalProps) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FundingFormData>({
    defaultValues: {
      fundingType: "card",
      routingNumber: "",
    },
  });

  const fundingType = watch("fundingType");
  const fundAccountMutation = trpc.account.fundAccount.useMutation();

  const onSubmit = async (data: FundingFormData) => {
    setError("");

    try {
      // Normalize the amount before parsing
      const normalizedAmountStr = normalizeFundingAmount(data.amount);
      const amount = parseFloat(normalizedAmountStr);
      const normalizedAccountNumber =
        data.fundingType === "card"
          ? normalizeCardNumber(data.accountNumber)
          : data.accountNumber;

      await fundAccountMutation.mutateAsync({
        accountId,
        amount,
        fundingSource: {
          type: data.fundingType,
          accountNumber: normalizedAccountNumber,
          routingNumber: data.routingNumber,
        },
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fund account");
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Fund Your Account
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Amount
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                {...register("amount", {
                  required: "Amount is required",
                  pattern: {
                    value: /^[\d,.\s]+$/,
                    message: "Invalid amount format",
                  },
                  validate: {
                    minimumAmount: (value) => {
                      const normalized = normalizeFundingAmount(value);
                      const num = parseFloat(normalized);
                      return (
                        (num >= 10 && !isNaN(num)) ||
                        "Amount must be at least $10.00"
                      );
                    },
                    maximumAmount: (value) => {
                      const normalized = normalizeFundingAmount(value);
                      const num = parseFloat(normalized);
                      return (
                        (num <= 10000 && !isNaN(num)) ||
                        "Amount cannot exceed $10,000"
                      );
                    },
                  },
                  onChange: (e) => {
                    const normalized = normalizeFundingAmount(e.target.value);
                    setValue("amount", normalized, { shouldValidate: true });
                  },
                })}
                type="text"
                className="pl-7 block w-full rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2 border"
                placeholder="0.00"
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Funding Source
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  {...register("fundingType")}
                  type="radio"
                  value="card"
                  className="mr-2"
                />
                <span>Credit/Debit Card</span>
              </label>
              <label className="flex items-center">
                <input
                  {...register("fundingType")}
                  type="radio"
                  value="bank"
                  className="mr-2"
                />
                <span>Bank Account</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {fundingType === "card" ? "Card Number" : "Account Number"}
            </label>
            <input
              {...register("accountNumber", {
                required: `${
                  fundingType === "card" ? "Card" : "Account"
                } number is required`,
                validate: (value) => {
                  if (fundingType === "card") {
                    return validateCardNumber(value);
                  }

                  if (!value || !/^\d+$/.test(value)) {
                    return "Invalid account number";
                  }

                  return true;
                },
              })}
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder={
                fundingType === "card" ? "1234 5678 1234 5678" : "123456789"
              }
            />
            {errors.accountNumber && (
              <p className="mt-1 text-sm text-red-600">
                {errors.accountNumber.message}
              </p>
            )}
          </div>

          {fundingType === "bank" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Routing Number
              </label>
              <input
                {...register("routingNumber", {
                  required: "Routing number is required",
                  validate: (value) => {
                    if (!value) {
                      return "Routing number is required";
                    }

                    if (!/^\d+$/.test(value)) {
                      return "Routing number must contain digits only";
                    }

                    if (value.length !== 9) {
                      return "Routing number must be exactly 9 digits";
                    }

                    return true;
                  },
                })}
                type="text"
                maxLength={9}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                placeholder="123456789"
              />
              {errors.routingNumber && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.routingNumber.message}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={fundAccountMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {fundAccountMutation.isPending ? "Processing..." : "Fund Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
