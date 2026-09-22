from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q, Sum, Count
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_POST
from .models import Sale, SaleItem
from products.models import Product
from decimal import Decimal
from django.utils import timezone
from datetime import datetime, timedelta
import json

@login_required
def sale_list(request):
    search_query = request.GET.get('search', '')
    date_from = request.GET.get('date_from', '')
    date_to = request.GET.get('date_to', '')
    payment_method = request.GET.get('payment_method', '')
    
    sales = Sale.objects.all().select_related('created_by')
    
    if search_query:
        sales = sales.filter(
            Q(sale_number__icontains=search_query) |
            Q(customer_name__icontains=search_query) |
            Q(customer_phone__icontains=search_query)
        )
    
    if date_from:
        sales = sales.filter(created_at__date__gte=date_from)
    
    if date_to:
        sales = sales.filter(created_at__date__lte=date_to)
    
    if payment_method:
        sales = sales.filter(payment_method=payment_method)
    
    # Pagination could be added here
    sales = sales[:100]  # Limit to 100 for performance
    
    total_sales = sales.aggregate(total=Sum('total_amount'))['total'] or 0
    sales_count = sales.count()
    avg_sale = total_sales / sales_count if sales_count > 0 else 0
    
    context = {
        'sales': sales,
        'total_sales': total_sales,
        'avg_sale': avg_sale,
        'sales_count': sales_count,
        'search_query': search_query,
        'date_from': date_from,
        'date_to': date_to,
        'payment_method': payment_method,
        'payment_methods': Sale.PAYMENT_METHODS,
    }
    
    return render(request, 'sales/sale_list.html', context)

@login_required
def sale_create(request):
    if request.method == 'POST':
        try:
            # Create sale
            sale = Sale.objects.create(
                customer_name=request.POST.get('customer_name', ''),
                customer_phone=request.POST.get('customer_phone', ''),
                customer_email=request.POST.get('customer_email', ''),
                discount_amount=Decimal(request.POST.get('discount_amount', '0')),
                tax_amount=Decimal(request.POST.get('tax_amount', '0')),
                payment_method=request.POST.get('payment_method', 'cash'),
                payment_received=Decimal(request.POST.get('payment_received', '0')),
                notes=request.POST.get('notes', ''),
                created_by=request.user
            )
            
            # Process sale items
            products = request.POST.getlist('product_id')
            quantities = request.POST.getlist('quantity')
            unit_prices = request.POST.getlist('unit_price')
            
            for i, product_id in enumerate(products):
                if product_id and quantities[i] and unit_prices[i]:
                    product = Product.objects.get(id=product_id)
                    quantity = int(quantities[i])
                    unit_price = Decimal(unit_prices[i])
                    
                    # Check stock availability
                    if product.stock_quantity < quantity:
                        messages.error(request, f'Insufficient stock for {product.name}. Available: {product.stock_quantity}')
                        sale.delete()
                        return redirect('sales:sale_create')
                    
                    SaleItem.objects.create(
                        sale=sale,
                        product=product,
                        quantity=quantity,
                        unit_price=unit_price
                    )
            
            messages.success(request, f'Sale {sale.sale_number} created successfully!')
            return redirect('sales:sale_detail', sale_id=sale.id)
            
        except Exception as e:
            messages.error(request, f'Error creating sale: {str(e)}')
    
    products = Product.objects.filter(is_active=True, stock_quantity__gt=0).order_by('name')
    return render(request, 'sales/sale_form.html', {'products': products})

@login_required
def sale_detail(request, sale_id):
    sale = get_object_or_404(Sale, id=sale_id)
    return render(request, 'sales/sale_detail.html', {'sale': sale})

@login_required
def sale_receipt(request, sale_id):
    sale = get_object_or_404(Sale, id=sale_id)
    return render(request, 'sales/sale_receipt.html', {'sale': sale})

@login_required
def get_product_info(request):
    product_id = request.GET.get('product_id')
    try:
        product = Product.objects.get(id=product_id)
        return JsonResponse({
            'success': True,
            'name': product.name,
            'price': str(product.price),
            'stock': product.stock_quantity,
            'unit': product.unit
        })
    except Product.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Product not found'})

@login_required
def daily_sales(request):
    today = timezone.now().date()
    sales = Sale.objects.filter(created_at__date=today)
    
    total_sales = sales.aggregate(total=Sum('total_amount'))['total'] or 0
    total_transactions = sales.count()
    
    # Sales by payment method
    payment_stats = sales.values('payment_method').annotate(
        count=Count('id'),
        total=Sum('total_amount')
    )
    
    # Hourly sales data for chart
    hourly_sales = []
    for hour in range(24):
        hour_sales = sales.filter(created_at__hour=hour).aggregate(
            total=Sum('total_amount')
        )['total'] or 0
        hourly_sales.append(float(hour_sales))
    
    context = {
        'sales': sales[:20],  # Last 20 sales
        'total_sales': total_sales,
        'total_transactions': total_transactions,
        'payment_stats': payment_stats,
        'hourly_sales': json.dumps(hourly_sales),
        'today': today,
    }
    
    return render(request, 'sales/daily_sales.html', context)

@login_required
def search_products(request):
    query = request.GET.get('q', '')
    products = Product.objects.filter(
        Q(name__icontains=query) | Q(sku__icontains=query) | Q(barcode__icontains=query),
        is_active=True,
        stock_quantity__gt=0
    )[:10]
    
    results = [{
        'id': product.id,
        'name': product.name,
        'sku': product.sku,
        'price': str(product.price),
        'stock': product.stock_quantity,
        'unit': product.unit
    } for product in products]
    
    return JsonResponse({'products': results})
