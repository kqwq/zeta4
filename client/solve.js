// Solve for prime number
//
function isPrime(n) {
    if (n < 2) return false;
    if (n == 2) return true;
    if (n % 2 == 0) return false;
    for (var i = 3; i <= Math.sqrt(n); i += 2) {
        if (n % i == 0) return false;
    }
    return true;
}

// Find all divisors of a number
//
function divisors(n) {
    var divisors = [];
    for (var i = 1; i <= Math.sqrt(n); i++) {
        if (n % i == 0) {
            divisors.push(i);
            if (i != Math.sqrt(n)) {
                divisors.push(n / i);
            }
        }
    }
    return divisors;
}

// test cases
//
var number1 = 100;
var number2 = 1054233243243241;
var number3 = 31;

var result1 = isPrime(number1);
// If result is false, then find all divisors of the number
var divisors1 = divisors(number1);
// Repeat for all test cases
var result2 = isPrime(number2);
var divisors2 = divisors(number2);
var result3 = isPrime(number3);
var divisors3 = divisors(number3);

// print it out
//
console.log("Number: " + number1 + " is prime: " + result1, "Divisors: " + divisors1);
console.log("Number: " + number2 + " is prime: " + result2, "Divisors: " + divisors2);
console.log("Number: " + number3 + " is prime: " + result3, "Divisors: " + divisors3);