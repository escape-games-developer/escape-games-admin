import { forwardRef, type InputHTMLAttributes } from "react";
import Icon from "./icons";
import Input from "./Input";

const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SearchInput({ placeholder = "Buscar...", ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="search"
        leading={<Icon name="search" size={16} />}
        placeholder={placeholder}
        {...props}
      />
    );
  }
);

export default SearchInput;
